import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DoctorService } from 'src/doctor/doctor.service';
import { BookAppointmentDto } from './dto/appointment.dto';
import { Role, AppointmentStatus, SchedulingType, Gender } from 'src/generated/prisma/enums';

@Injectable()
export class AppointmentService {
  constructor(
    private prisma: PrismaService,
    private doctorService: DoctorService,
  ) { }

  
  // next available appointmetn helper function
  private async findNextAvailableSlot(
    doctorId: string, 
    fromDate: string,
    searchWindowDays: number = 30
  ) : Promise<
    | { date: string; slots: any[]; schedulingType: SchedulingType }
    | { date: string; waves: any[]; schedulingType: SchedulingType }
    | null
  > 
  {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException('Doctor record not found.');
    }

    let searchDate = new Date(`${fromDate}T00:00:00.000Z`);

    for (let i = 0; i < searchWindowDays; i++) {
      const dateString = searchDate.toISOString().split('T')[0];

      try {
        const result = await this.doctorService.generateAndFilterSlots(doctorId, dateString);

        const hasAvailablility = doctor.schedulingType === SchedulingType.STREAM
          ? (result as any).slots?.length > 0
          : (result as any).waves?.some((w: any) => !w.isFull);

        if (hasAvailablility) {
          return {
            date: dateString,
            schedulingType: doctor.schedulingType,
            ...(doctor.schedulingType === SchedulingType.STREAM
              ? { slots: (result as any).slots }
              : { waves: (result as any).waves }
            )
          };
        } 
      }
      catch (error) {
        // bcoz our generateAndFilterSlots method throws an error 
        // if the doctor has no availability on that date, 
        // we can safey ignore it and continue searching
      }

      searchDate.setUTCDate(searchDate.getUTCDate() + 1); 
    } 

    return null; 
  }

  // 1. Book Appointment
  async bookAppointment(userId: string, dto: BookAppointmentDto) {
  const patient = await this.prisma.patient.findUnique({ where: { userId } });
  if (!patient) throw new NotFoundException('Patient record not found.');

  const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
  if (!doctor) throw new NotFoundException('Doctor record not found.');

  const requestedStart = new Date(`${dto.date}T${dto.startTime}:00.000Z`);
  const requestedEnd = new Date(`${dto.date}T${dto.endTime}:00.000Z`);

  const startOfDay = new Date(`${dto.date}T00:00:00.000Z`);
  const endOfDay = new Date(`${dto.date}T23:59:59.999Z`);

  const appointmentForSameDay = await this.prisma.appointment.findMany({
    where: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED, AppointmentStatus.COMPLETED]},
      startTime: {
        gte: startOfDay,
        lte: endOfDay,
      }
    }
  });

  if (appointmentForSameDay.length > 0) {
    throw new BadRequestException("A slot has already been booked for this day")
  }

  if (requestedStart <= new Date()) {
    throw new BadRequestException('Cannot book appointments for past dates or times.');
  }

  const matrix = await this.doctorService.generateAndFilterSlots(dto.doctorId, dto.date);

  // ✅ PRE-TRANSACTION VALIDATION (outside transaction)
  if (doctor.schedulingType === 'STREAM') {
    const requestedSlot = (matrix as any).slots?.find(
      (s: any) => new Date(s.startTime).getTime() === requestedStart.getTime()
    );

    if (!requestedSlot) {
      const nextAvailable = await this.findNextAvailableSlot(dto.doctorId, dto.date);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Requested slot is unavailable or invalid.',
        suggestedSlot: nextAvailable ?? {
          message: 'No available slots found in the next 30 days for this doctor.'
        }
      });
    }

  } else {
    const requestedWave = (matrix as any).waves?.find(
      (w: any) => new Date(w.startTime).getTime() === requestedStart.getTime()
    );

    if (!requestedWave) {
      const nextAvailable = await this.findNextAvailableSlot(dto.doctorId, dto.date);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Requested wave window is invalid.',
        suggestedSlot: nextAvailable ?? {
          message: 'No available wave slots found in the next 30 days for this doctor.'
        }
      });
    }

    if (requestedWave.isFull) {
      const nextAvailable = await this.findNextAvailableSlot(dto.doctorId, dto.date);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Requested wave window is full.',
        suggestedSlot: nextAvailable ?? {
          message: 'No available wave slots found in the next 30 days for this doctor.'
        }
      });
    }
  }

  // ✅ TRANSACTION BLOCK (race condition protection)
  return this.prisma.$transaction(async (tx) => {
    // 1. Fetch active bookings based on doctor and startTime only
    const activeBookings = await tx.appointment.findMany({
      where: {
        doctorId: dto.doctorId,
        startTime: requestedStart,
        appointmentStatus: { in: ['BOOKED', 'RESCHEDULED'] }
      }
    });

    if (doctor.schedulingType === 'STREAM') {
      // For STREAM, we still want to ensure the exact slot isn't taken
      const exactSlotTaken = activeBookings.some(b => b.endTime.getTime() === requestedEnd.getTime());
      if (exactSlotTaken) {
        throw new ConflictException('This exact stream slot has already been booked.');
      }

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: dto.doctorId,
          startTime: requestedStart,
          endTime: requestedEnd,
          appointmentStatus: 'BOOKED'
        }
      });

    } else {
      // 2. Validate overall wave capacity
      if (activeBookings.length >= doctor.maxWaveCapacity) {
        throw new ConflictException('This wave window is entirely full.');
      }

      // 3. This will now properly catch duplicates since activeBookings captures the whole wave!
      const isAlreadyInWave = activeBookings.some(b => b.patientId === patient.id);
      if (isAlreadyInWave) {
        throw new BadRequestException('Duplicate protection: You already have a token inside this wave block.');
      }

      // 4. Token numbers will now increment properly (1, 2, 3...)
      const nextTokenNumber = activeBookings.length + 1;

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: dto.doctorId,
          startTime: requestedStart,
          endTime: requestedEnd,
          appointmentStatus: 'BOOKED',
          tokenNumber: nextTokenNumber
        }
      });
    }
  });
}

  // 2. Patient Appointment View
  async getPatientAppointments(userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found.');

    const appointments = await this.prisma.appointment.findMany({
      where: { patientId: patient.id },
      include: {
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No appointments found for your history.');
    }

    return appointments;
  }

  // 3. Cancel Appointment
  async cancelAppointment(appointmentId: string, userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found.');

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    // Rule: Invalid appointment ID
    if (!appointment) {
      throw new NotFoundException('Appointment record not found.');
    }

    // Rule: Only appointment owner can cancel
    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('Access Denied: You cannot alter another patient’s appointment.');
    }

    // Rule: Cannot cancel an already cancelled appointment
    if (
      appointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_PATIENT ||
      appointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_DOCTOR
    ) {
      throw new BadRequestException('Action Invalid: This appointment is already cancelled.');
    }

    // Rule: Past appointment should not be cancellable
    if (new Date(appointment.startTime) <= new Date()) {
      throw new BadRequestException('Action Invalid: Historical or past appointments cannot be cancelled.');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { appointmentStatus: AppointmentStatus.CANCELLED_BY_PATIENT },
    });
  }

  // 4. Doctor Appointment View
  async getDoctorAppointments(userId: string, userRole: Role) {
    // Rule: Verify Role Security
    if (userRole !== Role.DOCTOR) {
      throw new ForbiddenException('Access Denied: Roster details are restricted to doctors.');
    }

    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException('Doctor profile metadata not found.');
    }

    const appointments = await this.prisma.appointment.findMany({
      where: { doctorId: doctor.id },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true, mobileNo: true, email: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    if (appointments.length === 0) {
      throw new NotFoundException('No scheduled appointments found on your profile roster.');
    }

    return appointments;
  }


  async rescheduleAppointment(appointmentId: string, userId: string, dto: BookAppointmentDto) {
  const patient = await this.prisma.patient.findUnique({
    where: { userId },
    select: {
      id: true,
      appointment: {
        where: { id: appointmentId },
        select: { id: true, doctorId: true, startTime: true, endTime: true, appointmentStatus: true }
      }
    }
  }) as {
    id: string;
    appointment: Array<{ id: string; doctorId: string; startTime: Date; endTime: Date; appointmentStatus: AppointmentStatus; }>;
  } | null;

  if (!patient) throw new NotFoundException('Patient profile not found.');
  if (patient.appointment.length === 0) {
    throw new NotFoundException('Appointment record not found for rescheduling.');
  }

  const oldAppointment = patient.appointment[0];
  const targetDoctorId = oldAppointment.doctorId; // Protect against missing dto.doctorId

  if (oldAppointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_PATIENT || 
      oldAppointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_DOCTOR) {
    throw new BadRequestException('Cannot reschedule a cancelled appointment. Please book a new one instead.');
  }

  const oldStartMs = new Date(oldAppointment.startTime).getTime();
  const thirtyMinutesInMs = 30 * 60 * 1000;
  if (oldStartMs - Date.now() < thirtyMinutesInMs) {
    throw new BadRequestException('Rescheduling window has closed: Changes must be made at least 30 minutes before the original appointment time.');
  }

  const requestedStart = new Date(`${dto.date}T${dto.startTime}:00.000Z`);
  const requestedEnd = new Date(`${dto.date}T${dto.endTime}:00.000Z`);

  const startOfDay = new Date(`${dto.date}T00:00:00.000Z`);
  const endOfDay = new Date(`${dto.date}T23:59:59.999Z`);

  // BUGFIX: Added "id: { not: appointmentId }" so the patient doesn't block themselves on the same day
  const appointmentForSameDay = await this.prisma.appointment.findMany({
    where: {
      id: { not: appointmentId },
      patientId: patient.id,
      doctorId: targetDoctorId,
      appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED, AppointmentStatus.COMPLETED]},
      startTime: {
        gte: startOfDay,
        lte: endOfDay,
      }
    }
  });

  if (appointmentForSameDay.length > 0) {
    throw new BadRequestException("A slot has already been booked for this day.");
  }

  if (oldStartMs === requestedStart.getTime()) {
    throw new BadRequestException('You already have an appointment booked for this exact time.');
  }

  if (requestedStart <= new Date()) {
    throw new BadRequestException('Cannot reschedule to past dates or times.');
  }

  const doctor = await this.prisma.doctor.findUnique({ where: { id: targetDoctorId } });
  if (!doctor) throw new NotFoundException('Associated doctor record not found for this appointment.');

  const matrix = await this.doctorService.generateAndFilterSlots(targetDoctorId, dto.date);

  let targetedWaveBlock: any = null;

  if (doctor.schedulingType === SchedulingType.STREAM) {
    const isValidSlot = (matrix as any).slots?.some(
      (s: any) => new Date(s.startTime).getTime() === requestedStart.getTime()
    );

    if (!isValidSlot) {
      const nextAvailable = await this.findNextAvailableSlot(targetDoctorId, dto.date);
      throw new BadRequestException({
        message: 'Requested slot is unavailable or invalid for rescheduling.',
        suggestedSlot: nextAvailable ?? { message: 'No available slots found in the next 30 days for this doctor.' }
      });
    }
  } else {
    targetedWaveBlock = (matrix as any).waves?.find((w: any) => {
      const waveStart = new Date(w.startTime).getTime();
      const waveEnd = new Date(w.endTime).getTime();
      return requestedStart.getTime() >= waveStart && requestedStart.getTime() < waveEnd;
    });

    if (!targetedWaveBlock || targetedWaveBlock.isFull || targetedWaveBlock.availableSlots <= 0) {
      const nextAvailable = await this.findNextAvailableSlot(targetDoctorId, dto.date);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: !targetedWaveBlock ? 'Requested wave window is invalid.' : 'Requested wave window is full.',
        suggestedSlot: nextAvailable ?? { message: 'No available wave slots found in the next 30 days for this doctor.' }
      });
    }
  }

  return this.prisma.$transaction(async (tx) => {
    // ✅ BUGFIX: Query wave bookings via absolute structural wave boundaries, not client DTO times
    const waveQueryWindow = doctor.schedulingType === SchedulingType.WAVE && targetedWaveBlock
      ? { startTime: new Date(targetedWaveBlock.startTime), endTime: new Date(targetedWaveBlock.endTime) }
      : { startTime: requestedStart, endTime: requestedEnd };

    const activeBookingOnNewSlot = await tx.appointment.findMany({
      where: {
        doctorId: targetDoctorId,
        startTime: waveQueryWindow.startTime,
        endTime: waveQueryWindow.endTime,
        appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] }
      }
    });

    if (doctor.schedulingType === SchedulingType.STREAM && activeBookingOnNewSlot.length > 0) {
      throw new ConflictException('This exact stream slot has already been booked.');
    }

    let nextTokenNumber: number | undefined = undefined;
    if (doctor.schedulingType === SchedulingType.WAVE) {
      if (activeBookingOnNewSlot.length >= doctor.maxWaveCapacity) {
        throw new ConflictException('This wave window is entirely full.');
      }
      nextTokenNumber = activeBookingOnNewSlot.length + 1;
    }

    const oldWaveStart = new Date(oldAppointment.startTime);
    const oldWaveEnd = new Date(oldAppointment.endTime);

    const updatedAppointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        startTime: requestedStart,
        endTime: requestedEnd,
        appointmentStatus: AppointmentStatus.RESCHEDULED,
        tokenNumber: nextTokenNumber
      },
    });

    // --- TOKEN RESEQUENCING ---
    if (doctor.schedulingType === SchedulingType.WAVE) {
      const remainingOldWaveBookings = await tx.appointment.findMany({
        where: {
          doctorId: targetDoctorId,
          startTime: oldWaveStart,
          endTime: oldWaveEnd,
          appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] }
        },
        orderBy: { tokenNumber: 'asc' }
      });

      // ✅ BUGFIX: Replaced execution pool mapping with a safe linear for-of execution cycle 
      if (remainingOldWaveBookings.length > 0) {
        let index = 1;
        for (const booking of remainingOldWaveBookings) {
          await tx.appointment.update({
            where: { id: booking.id },
            data: { tokenNumber: index }
          });
          index++;
        }
      }
    }

    return updatedAppointment;
  });
}
}
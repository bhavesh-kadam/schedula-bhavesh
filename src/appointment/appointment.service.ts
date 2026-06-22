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
      // const nextAvailable = (matrix as any).slots?.[0];
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

    // hello kamesh sir, 
    // should i combine following two if conditions into one, 
    // since both throw the same error with different message?

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

    if (oldAppointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_PATIENT || 
        oldAppointment.appointmentStatus === AppointmentStatus.CANCELLED_BY_DOCTOR) {
      throw new BadRequestException('Cannot reschedule a cancelled appointment. Please book a new one instead.');
    }

    const oldStartMs = new Date(oldAppointment.startTime).getTime();
    const thrityMinutesInMs = 30 * 60 * 1000;
    if (oldStartMs - Date.now() < thrityMinutesInMs) {
      throw new BadRequestException('Rescheduling window has closed: Changes must be made at least 30 minutes before the original appointment time.');
    }

    const requestedStart = new Date(`${dto.date}T${dto.startTime}:00.000Z`);
    const requestedEnd = new Date(`${dto.date}T${dto.endTime}:00.000Z`);

    if (oldStartMs === requestedStart.getTime()) {
      throw new BadRequestException('You already have an appointment booked for this exact time. Please choose a different slot to reschedule.');
    }

    if (requestedStart <= new Date()) {
      throw new BadRequestException('Cannot reschedule to past dates or times. Please select a future slot.');
    }

    const doctor = await this.prisma.doctor.findUnique({ where: { id: oldAppointment.doctorId } });
    if (!doctor) throw new NotFoundException('Associated doctor record not found for this appointment.');

    const matrix = await this.doctorService.generateAndFilterSlots(oldAppointment.doctorId, dto.date);

    if (doctor.schedulingType === SchedulingType.STREAM) {
      const isValidSlot = (matrix as any).slots?.some(
        (s: any) => new Date(s.startTime).getTime() === requestedStart.getTime()
      );

      if (!isValidSlot) {
        const nextAvailable = await this.findNextAvailableSlot(dto.doctorId, dto.date);
        throw new BadRequestException({
          message: 'Requested slot is unavailable or invalid for rescheduling.',
          suggestedSlot: nextAvailable ?? {
            message: 'No available slots found in the next 30 days for this doctor.'
          }
        });
      }
    } else {
      // Step 1: Find a wave block where the requested time fits cleanly inside
      const targetWave = (matrix as any).waves?.find((w: any) => {
        const waveStart = new Date(w.startTime).getTime();
        const waveEnd = new Date(w.endTime).getTime();
        const requestedStartMs = new Date(`${dto.date}T${dto.startTime}:00.000Z`).getTime();

        return requestedStartMs >= waveStart && requestedStartMs < waveEnd;
      });

      // Step 2: Gatekeeper if no wave matches or if it's full
      if (!targetWave || targetWave.isFull || targetWave.availableSlots <= 0) {
        // Find alternative waves that have space
        const nextAvailable = await this.findNextAvailableSlot(dto.doctorId, dto.date);

        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: !targetWave 
            ? 'Requested wave window is invalid for rescheduling. Please select a valid wave slot.'
            : 'Requested wave window is full for rescheduling.',
          suggestedSlot: nextAvailable ?? {
            message: 'No available wave slots found in the next 30 days for this doctor.'
          }
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const activeBookingOnNewSlot = await tx.appointment.findMany({
        where: {
          doctorId: oldAppointment.doctorId,
          startTime: requestedStart,
          endTime: requestedEnd,
          appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] }
        }
      });

      if (doctor.schedulingType === SchedulingType.STREAM && activeBookingOnNewSlot.length > 0) {
        throw new ConflictException('This exact stream slot has already been booked by another patient. Please choose a different slot to reschedule.');
      }

      let nextTokenNumber: number | undefined = undefined;
      if (doctor.schedulingType === SchedulingType.WAVE) {
        if (activeBookingOnNewSlot.length >= doctor.maxWaveCapacity) {
          throw new ConflictException('This wave window is entirely full. Please choose a different slot to reschedule.');
        }
        nextTokenNumber = activeBookingOnNewSlot.length + 1;
      }

      // Capture old wave window BEFORE updating the record
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

      // --- TOKEN RESEQUENCING for old wave ---
      // After the record moves out, remaining tokens in the old wave may have gaps.
      // Re-assign tokens 1, 2, 3... in startTime order (which is booking order for wave).
      if (doctor.schedulingType === SchedulingType.WAVE) {
        const remainingOldWaveBookings = await tx.appointment.findMany({
          where: {
            doctorId: oldAppointment.doctorId,
            startTime: oldWaveStart,
            endTime: oldWaveEnd,
            appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] }
          },
          orderBy: { tokenNumber: 'asc' }
        });

        // Only resequence if there are gaps (i.e. someone left mid-sequence)
        if (remainingOldWaveBookings.length > 0) {
          await Promise.all(
            remainingOldWaveBookings.map((booking, index) =>
              tx.appointment.update({
                where: { id: booking.id },
                data: { tokenNumber: index + 1 }
              })
            )
          );
        }
      }

      return updatedAppointment;
    });

  }
}
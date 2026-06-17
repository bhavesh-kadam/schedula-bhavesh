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
import { Role, AppointmentStatus, SchedulingType } from 'src/generated/prisma/enums';

@Injectable()
export class AppointmentService {
  constructor(
    private prisma: PrismaService,
    private doctorService: DoctorService,
  ) {}

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

  // Reuse slot matrix logic to make sure the time block matches operational hours
  const matrix = await this.doctorService.generateAndFilterSlots(dto.doctorId, dto.date);
  
  if (doctor.schedulingType === 'STREAM') {
    const isValidSlot = (matrix as any).slots?.some(
      (s: any) => new Date(s.startTime).getTime() === requestedStart.getTime()
    );
    if (!isValidSlot) throw new BadRequestException('Requested slot is unavailable or invalid.');
  } else {
    const isValidWave = (matrix as any).waves?.some(
      (w: any) => new Date(w.startTime).getTime() === requestedStart.getTime() && !w.isFull
    );
    if (!isValidWave) throw new BadRequestException('Requested wave window is full or invalid.');
  }

  // Execution Isolation Transaction Block
  return this.prisma.$transaction(async (tx) => {
    const activeBookings = await tx.appointment.findMany({
      where: {
        doctorId: dto.doctorId,
        startTime: requestedStart,
        endTime: requestedEnd,
        appointmentStatus: { in: ['BOOKED', 'RESCHEDULED'] }
      }
    });

    if (doctor.schedulingType === 'STREAM') {
      if (activeBookings.length > 0) {
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
      // --- WAVE CAP AND AUTO-TOKEN ASSIGNMENT ---
      if (activeBookings.length >= doctor.maxWaveCapacity) {
        throw new ConflictException('This wave window is entirely full.');
      }

      const isAlreadyInWave = activeBookings.some(b => b.patientId === patient.id);
      if (isAlreadyInWave) {
        throw new BadRequestException('Duplicate protection: You already have a token inside this wave block.');
      }

      // Assign sequential token position based on the current order array width
      const nextTokenNumber = activeBookings.length + 1;

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: dto.doctorId,
          startTime: requestedStart,
          endTime: requestedEnd,
          appointmentStatus: 'BOOKED',
          tokenNumber: nextTokenNumber // 👈 Injects Token ID safely
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

    // Rule: Cannot cancel already cancelled appointment
    if (appointment.appointmentStatus === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Action Invalid: This appointment is already cancelled.');
    }

    // Rule: Past appointment should not be cancellable
    if (new Date(appointment.startTime) <= new Date()) {
      throw new BadRequestException('Action Invalid: Historical or past appointments cannot be cancelled.');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { appointmentStatus: AppointmentStatus.CANCELLED },
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

    if (oldAppointment.appointmentStatus === AppointmentStatus.CANCELLED) {
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
        const nextAvailable = (matrix as any).slots?.[0];
        throw new BadRequestException({ 
          message: 'Requested slot is unavailable or invalid for rescheduling.', 
          suggestedSlot: nextAvailable ? `${nextAvailable.displayTime}`: 'No remaining slots available on this date.' });
      }
    } else {
      const isValidWave = (matrix as any).waves?.some(
        (w: any) => new Date(w.startTime).getTime() === requestedStart.getTime() && !w.isFull
      );

      if (!isValidWave) {
        const nextAvailable = (matrix as any).waves?.find((w: any) => !w.isFull);
        throw new BadRequestException({ 
          message: 'Requested wave window is full or invalid for rescheduling.',
          suggestedSlot: nextAvailable ? `${nextAvailable.wave.displayTime}`: 'No remaining wave windows available on this date.' 
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

      return tx.appointment.update({
        where: { id: appointmentId },
        data: { 
          startTime: requestedStart, 
          endTime: requestedEnd, 
          appointmentStatus: AppointmentStatus.RESCHEDULED,
          tokenNumber: nextTokenNumber
        },
      });
    });

  }
}
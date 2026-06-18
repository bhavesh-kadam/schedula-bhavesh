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
import { Role, AppointmentStatus } from 'src/generated/prisma/enums';

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
}
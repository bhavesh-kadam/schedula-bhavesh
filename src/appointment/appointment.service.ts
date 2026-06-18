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

    // Resolve internal Patient record from the logged-in User ID
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) {
      throw new NotFoundException('Patient sub-profile record not found for this account.');
    }

    // Rule: Appointment should be for a future date/time
    const systemNow = new Date();
    const requestedStart = new Date(`${dto.date}T${dto.startTime}:00.000Z`);
    const requestedEnd = new Date(`${dto.date}T${dto.endTime}:00.000Z`);

    if (requestedStart <= systemNow) {
      throw new BadRequestException('Validation Failed: Cannot book appointments for past dates or times.');
    }

    // Rule: Doctor should exist
    const doctorExists = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
    if (!doctorExists) {
      throw new NotFoundException('Doctor record not found.');
    }

    // Calculate dynamic duration in minutes directly from the payload times
    const durationMinutes = (requestedEnd.getTime() - requestedStart.getTime()) / 60000;

    // 3. Pass calculated window width straight into your generator matrix
    const availabilityMatrix = await this.doctorService.generateAndFilterSlots(
    dto.doctorId, 
    dto.date, 
    durationMinutes // Automatically evaluates matrix based on user's exact requested time block
    );
    // Rule: Slot should exist and be available inside our generated matrix
    const isSlotValidAndFree = availabilityMatrix.slots.some(
      (slot: {startTime: string, endTime: string, displayTime: string}) => 
        new Date(slot.startTime).getTime() === requestedStart.getTime()
    );

    if (!isSlotValidAndFree) {
      throw new ConflictException('The requested slot is either unavailable, occupied, or outside operational hours.');
    }

    // Rule: Same slot should not be booked twice (Race Condition Check via Transaction)
    return this.prisma.$transaction(async (tx) => {
      const activeCollision = await tx.appointment.findFirst({
        where: {
          doctorId: dto.doctorId,
          startTime: requestedStart,
          appointmentStatus: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] },
        },
      });

      if (activeCollision) {
        throw new ConflictException('Slot concurrency exception: This slot was just secured by another patient.');
      }

      return tx.appointment.create({
        data: {
          patientId: patient.id, // Links to Patient UUID
          doctorId: dto.doctorId, // Links to Doctor UUID
          startTime: requestedStart,
          endTime: requestedEnd,
          appointmentStatus: AppointmentStatus.BOOKED,
        },
      });
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
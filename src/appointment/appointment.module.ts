import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { JwtService } from '@nestjs/jwt';
import { AppointmentService } from './appointment.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DoctorService } from 'src/doctor/doctor.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule],
  controllers: [AppointmentController],
  providers: [AppointmentService, JwtService, PrismaService, DoctorService],
})
export class AppointmentModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { PatientModule } from './patient/patient.module';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';
import { AppointmentService } from './appointment/appointment.service';
import { AppointmentModule } from './appointment/appointment.module';
import { DoctorService } from './doctor/doctor.service';

@Module({
  imports: [PrismaModule, PatientModule, DoctorModule, AuthModule, AppointmentModule],
  controllers: [AppController],
  providers: [AppService, PrismaService, DoctorService, AppointmentService],
})
export class AppModule {}

import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { BookAppointmentDto } from './dto/appointment.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard'; 
import { RoleGuard } from 'src/auth/guards/role.guard'; 
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/getUser.decorator'; 
import { Role } from 'src/generated/prisma/enums';

interface JwtPayload {
  sub: string;
  jti: string;
  firstName: string;
  email: string;
  role: Role;
}

@Controller('appointment')
@UseGuards(AuthGuard, RoleGuard)
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @Roles(Role.PATIENT)
  async book(@GetUser() user: JwtPayload, @Body() dto: BookAppointmentDto) {
    return this.appointmentService.bookAppointment(user.sub, dto);
  }

  @Get('my')
  @Roles(Role.PATIENT)
  async getPatientView(@GetUser() user: JwtPayload) {
    return this.appointmentService.getPatientAppointments(user.sub);
  }

  @Patch(':id/cancel')
  @Roles(Role.PATIENT)
  async cancel(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.appointmentService.cancelAppointment(id, user.sub);
  }
}
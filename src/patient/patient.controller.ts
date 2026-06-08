import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { PatientService } from './patient.service';
import { Role } from 'src/generated/prisma/enums';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { PatientProfileDto } from './dto/patient-profile.dto';

interface JwtPayload {
  sub: string;
  jti: string;
  firstName: string;
  email: string;
  role: Role
}

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}


  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.PATIENT)
  @Get('/profile')
  async fetchPatientProfile (
    @GetUser() user: JwtPayload,
  ) {
    return this.patientService.fetchPatientProfile(user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.PATIENT) 
  @Post("/profile")
  async savePatientProfile (
    @Body() dto: PatientProfileDto,
    @GetUser() user: JwtPayload
  ) {
    return this.patientService.savePatientProfile(dto, user.sub)
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.PATIENT) 
  @Patch("/profile")
  async updatePatientProfile (
    @Body() dto: PatientProfileDto,
    @GetUser() user: JwtPayload
  ) {
    return this.patientService.updatePatientProfile(dto, user.sub)
  }

}

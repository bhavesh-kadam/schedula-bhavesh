import { Controller, Get, UseGuards } from '@nestjs/common';
import { PatientService } from './patient.service';
import { Role } from 'src/generated/prisma/enums';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';

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
}

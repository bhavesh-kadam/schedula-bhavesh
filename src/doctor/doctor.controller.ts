import { Controller, Get, UseGuards } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { GetUser } from 'src/common/decorators/getUser.decorator';

interface JwtPayload {
  sub: string;
  jti: string;
  firstName: string;
  email: string;
  role: Role
}

@Controller('doctor')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Get('/profile')
  async fetchDoctorProfile (
    @GetUser() user: JwtPayload
  ) {
    console.log(user);
    return this.doctorService.fetchDoctorProfile(user.sub);
  }
}

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/generated/prisma/enums';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { GetDoctorsQueryDto, SaveProfileDto, UpdateProfileDto, RecurringAvailabilityDto, CustomAvailabilityDto, GetSlotsQueryDto, BulkRecurringAvailabilityDto } from './dto/doctor-profile.dto';

interface JwtPayload {
  sub: string;
  jti: string;
  firstName: string;
  email: string;
  role: Role;
}

@Controller('doctor')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Get('/profile')
  async fetchDoctorProfile(@GetUser() user: JwtPayload) {
    return this.doctorService.fetchDoctorProfile(user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Post('/profile')
  async saveDoctorProfile(@GetUser() user: JwtPayload, @Body() dto: SaveProfileDto) {
    return this.doctorService.saveDoctorProfile(dto, user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Patch('/profile')
  async updateDoctorProfile(@GetUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.doctorService.updateDoctorProfile(dto, user.sub);
  }

  // --- RECURRING WEEKLY AVAILABILITY MANAGEMENT ---

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Post('/availability')
  async addRecurringAvailability(@GetUser() user: JwtPayload, @Body() dto: RecurringAvailabilityDto) {
    return this.doctorService.addRecurringAvailability(user.sub, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Post('/availability/bulk')
  async addBulkRecurringAvailability(@GetUser() user: JwtPayload, @Body() dto: BulkRecurringAvailabilityDto) {
    return this.doctorService.addBulkRecurringAvailability(user.sub, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Get('/availability')
  async getMyRecurringAvailability(@GetUser() user: JwtPayload) {
    return this.doctorService.getDoctorRecurringAvailability(user.sub);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Patch('/availability/:id')
  async updateRecurringAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: RecurringAvailabilityDto
  ) {
    return this.doctorService.updateRecurringAvailability(id, user.sub, dto);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Delete('/availability/:id')
  async deleteRecurringAvailability(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: JwtPayload) {
    return this.doctorService.deleteRecurringAvailability(id, user.sub);
  }

  // --- CUSTOM OVERRIDE AVAILABILITY ---

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Post('/availability/override')
  async createCustomOverride(@GetUser() user: JwtPayload, @Body() dto: CustomAvailabilityDto) {
    return this.doctorService.createCustomOverride(user.sub, dto);
  }

  @Get('/availability/date')
  async getAvailabilityByDate(@Query('doctorId', ParseUUIDPipe) doctorId: string, @Query('date') dateString: string) {
    return this.doctorService.getAvailabilityByDate(doctorId, dateString);
  }

  // --- APPOINTMENTS Mangement ---
  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Get('/appointments')
  async getDoctorAppointments(
    @GetUser() user: JwtPayload,
    @Query('date') dateString?: string
  ) {
    return this.doctorService.getDoctorAppointments(user.sub, dateString);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Patch('/appointments/:id/cancel')
  async cancelDoctorAppointment(
    @GetUser() user: JwtPayload, 
    @Param('id', ParseUUIDPipe) appointmentId: string) {
    return this.doctorService.cancelDoctorAppointment(user.sub, appointmentId);
  }

  @UseGuards(AuthGuard, RoleGuard)
  @Roles(Role.DOCTOR)
  @Patch('/appointments/cancel-day')
  async cancelDoctorDay(
    @GetUser() user: JwtPayload, 
    @Query('date') dateString: string) {
    return this.doctorService.cancelDoctorDay(user.sub, dateString);
   }

  // --- PUBLIC DIRECTORIES ---

  @Get()
  async getDoctors(@Query() query: GetDoctorsQueryDto) {
    return this.doctorService.getDoctors(query);
  }

  @Get(':id')
  async getDoctorById(@Param('id', ParseUUIDPipe) doctorId: string) {
    return this.doctorService.getDoctorById(doctorId);
  }

  @Get(':id/slots')
  async getDoctorSlots(
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Query() query: GetSlotsQueryDto
  ) {
    return this.doctorService.generateAndFilterSlots(doctorId, query.date, query.duration);
  }
}
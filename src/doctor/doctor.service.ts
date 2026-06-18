import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ActiveStatus, Role, Day, OverrideType } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetDoctorsQueryDto, SaveProfileDto, UpdateProfileDto, RecurringAvailabilityDto, CustomAvailabilityDto } from './dto/doctor-profile.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class DoctorService {
    constructor(private prisma: PrismaService) {}

    // --- INTERNAL VALIDATION HELPERS ---

    private parseTimeToMinutes(timeStr: string): number {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    private checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
        const s1 = this.parseTimeToMinutes(start1);
        const e1 = this.parseTimeToMinutes(end1);
        const s2 = this.parseTimeToMinutes(start2);
        const e2 = this.parseTimeToMinutes(end2);
        return s1 < e2 && e1 > s2;
    }

    private checkDateTimeOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
        return start1 < end2 && end1 > start2;
    }

    private async getDoctorByUserId(userId: string) {
        const doctor = await this.prisma.doctor.findUnique({
            where: { userId },
            select: { id: true }
        });
        if (!doctor) {
            throw new NotFoundException("Doctor record not found");
        }
        return doctor;
    }

    // --- PROFILE CORE METHODS ---

    async fetchDoctorProfile (userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, firstName: true, lastName: true, email: true, role: true, gender: true, dob: true,
            }
        });

        if (!user) throw new UnauthorizedException("No user data found for this account");
        if (user.role !== Role.DOCTOR) throw new ForbiddenException("You are not authorized to access this resource");

        return { user };
    }

    async saveDoctorProfile (dto: SaveProfileDto, userId: string) {
        const existingDoctor = await this.prisma.doctor.findUnique({
            where: { userId },
            select: { id: true }
        });
        if (existingDoctor) throw new ConflictException("Doctor profile already exists");

        // Validate early time windows nested in profile creation payload
        for (const item of dto.availability) {
            if (this.parseTimeToMinutes(item.startTime) >= this.parseTimeToMinutes(item.endTime)) {
                throw new BadRequestException(`Invalid time range: ${item.startTime} to ${item.endTime}`);
            }
        }

        const result = await this.prisma.doctor.create({
            data: {
                licenseNo: dto.licenseNo,
                specialization: dto.specialization,
                qualification: dto.qualification,
                yearOfExperience: dto.yearsOfExperience,
                consultationFee: dto.consultationFee,
                activeStatus: ActiveStatus.ACTIVE,
                userId,
                recurringAvailability: {
                    createMany: {
                        data: dto.availability.map(a => ({
                            dayOfWeek: a.dayOfWeek,
                            startTime: a.startTime,
                            endTime: a.endTime,
                        }))
                    }
                }
            }
        });

        return { result };
    }

    async updateDoctorProfile (dto: UpdateProfileDto, userId: string) {
        const doctor = await this.getDoctorByUserId(userId);

        const result = await this.prisma.doctor.update({
            where: { userId },
            data: {
                specialization: dto.specialization,
                yearOfExperience: dto.yearsOfExperience,
                activeStatus: dto.activeStatus,
            }
        });

        return { result };
    }

    // --- RECURRING AVAILABILITY ACTIONS ---

    async addRecurringAvailability(userId: string, dto: RecurringAvailabilityDto) {
        const doctor = await this.getDoctorByUserId(userId);

        if (this.parseTimeToMinutes(dto.startTime) >= this.parseTimeToMinutes(dto.endTime)) {
            throw new BadRequestException("Invalid time range: Start time must be before end time");
        }

        const existingSlots = await this.prisma.recurringAvailability.findMany({
            where: { doctorId: doctor.id, dayOfWeek: dto.dayOfWeek }
        });

        for (const slot of existingSlots) {
            if (this.checkTimeOverlap(dto.startTime, dto.endTime, slot.startTime, slot.endTime)) {
                throw new ConflictException("❌ Overlapping time slot detected with an existing recurring window");
            }
        }

        return this.prisma.recurringAvailability.create({
            data: {
                doctorId: doctor.id,
                dayOfWeek: dto.dayOfWeek,
                startTime: dto.startTime,
                endTime: dto.endTime
            }
        });
    }

    async getDoctorRecurringAvailability(userId: string) {
        const doctor = await this.getDoctorByUserId(userId);
        return this.prisma.recurringAvailability.findMany({
            where: { doctorId: doctor.id },
            orderBy: { startTime: 'asc' }
        });
    }

    async updateRecurringAvailability(id: string, userId: string, dto: RecurringAvailabilityDto) {
        const doctor = await this.getDoctorByUserId(userId);
        
        const targetSlot = await this.prisma.recurringAvailability.findUnique({ where: { id } });
        if (!targetSlot || targetSlot.doctorId !== doctor.id) {
            throw new NotFoundException("Availability window not found or access denied");
        }

        if (this.parseTimeToMinutes(dto.startTime) >= this.parseTimeToMinutes(dto.endTime)) {
            throw new BadRequestException("Invalid time range");
        }

        const competingSlots = await this.prisma.recurringAvailability.findMany({
            where: { doctorId: doctor.id, dayOfWeek: dto.dayOfWeek, NOT: { id } }
        });

        for (const slot of competingSlots) {
            if (this.checkTimeOverlap(dto.startTime, dto.endTime, slot.startTime, slot.endTime)) {
                throw new ConflictException("❌ Overlapping time slot detected with an alternative window");
            }
        }

        return this.prisma.recurringAvailability.update({
            where: { id },
            data: { dayOfWeek: dto.dayOfWeek, startTime: dto.startTime, endTime: dto.endTime }
        });
    }

    async deleteRecurringAvailability(id: string, userId: string) {
        const doctor = await this.getDoctorByUserId(userId);
        const targetSlot = await this.prisma.recurringAvailability.findUnique({ where: { id } });
        
        if (!targetSlot || targetSlot.doctorId !== doctor.id) {
            throw new NotFoundException("Availability window not found");
        }

        return this.prisma.recurringAvailability.delete({ where: { id } });
    }

    // --- CUSTOM OVERRIDE LOGIC ---

    async createCustomOverride(userId: string, dto: CustomAvailabilityDto) {
        const doctor = await this.getDoctorByUserId(userId);
        const targetDate = new Date(dto.date);
        
        if (isNaN(targetDate.getTime())) {
            throw new BadRequestException("Invalid date format provided");
        }

        if (dto.overrideType === OverrideType.MODIFIED) {
            if (!dto.startTime || !dto.endTime) {
                throw new BadRequestException("Start and End times are mandatory for MODIFIED override type");
            }

            const start = new Date(dto.startTime);
            const end = new Date(dto.endTime);

            if (start >= end) {
                throw new BadRequestException("Invalid time range: Custom start must be earlier than end");
            }

            const existingOverrides = await this.prisma.customAvailability.findMany({
                where: { doctorId: doctor.id, date: targetDate, overrideType: OverrideType.MODIFIED }
            });

            for (const item of existingOverrides) {
                if (item.startTime && item.endTime) {
                    if (this.checkDateTimeOverlap(start, end, new Date(item.startTime), new Date(item.endTime))) {
                        throw new ConflictException("❌ Overlapping custom time windows detected for this targeted date");
                    }
                }
            }
        }

        return this.prisma.customAvailability.create({
            data: {
                doctorId: doctor.id,
                date: targetDate,
                overrideType: dto.overrideType,
                startTime: dto.startTime ? new Date(dto.startTime) : null,
                endTime: dto.endTime ? new Date(dto.endTime) : null,
            }
        });
    }

    async getAvailabilityByDate(doctorId: string, dateString: string) {
        const targetDate = new Date(dateString);
        if (isNaN(targetDate.getTime())) {
            throw new BadRequestException("Invalid date string input");
        }

        const customOverrides = await this.prisma.customAvailability.findMany({
            where: { doctorId, date: targetDate }
        });

        if (customOverrides.length > 0) {
            const blockedWindow = customOverrides.find(o => o.overrideType === OverrideType.UNAVAILABLE);
            if (blockedWindow) {
                return { date: dateString, status: "UNAVAILABLE", windows: [] };
            }

            return {
                date: dateString,
                status: "CUSTOM_OVERRIDE",
                windows: customOverrides.map(o => ({ startTime: o.startTime, endTime: o.endTime }))
            };
        }

        const daysMapping: Record<number, Day> = {
            0: Day.SUNDAY, 1: Day.MONDAY, 2: Day.TUESDAY, 
            3: Day.WEDNESDAY, 4: Day.THURSDAY, 5: Day.FRIDAY, 6: Day.SATURDAY
        };
        const targetDayOfWeek = daysMapping[targetDate.getUTCDay()];

        const recurringWindows = await this.prisma.recurringAvailability.findMany({
            where: { doctorId, dayOfWeek: targetDayOfWeek },
            orderBy: { startTime: 'asc' }
        });

        return {
            date: dateString,
            status: "RECURRING_WEEKLY",
            windows: recurringWindows.map(r => ({ startTime: r.startTime, endTime: r.endTime }))
        };
    }

    // --- PUBLIC RECTORY RETRIEVALS ---

    async getDoctors (query: GetDoctorsQueryDto) {
        const { specialization, search, availability, page = 1, limit = 10 } = query;
        const where: Prisma.DoctorWhereInput = {};

        if (specialization) {
            where.specialization = { equals: specialization, mode: 'insensitive' };
        }

        if (search) {
            where.OR = [
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
            ];
        }

        if (availability === true) {
            where.activeStatus = ActiveStatus.ACTIVE;
        }

        const doctors = await this.prisma.doctor.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            include: { user: { select: { firstName: true, lastName: true } } },
        });

        return doctors.map((d) => ({
            doctorId: d.id,
            fullName: `${d.user.firstName} ${d.user.lastName}`,
            specialization: d.specialization,
            experience: d.yearOfExperience,
            availabilityStatus: d.activeStatus === ActiveStatus.ACTIVE,
        }));
    }

    async getDoctorById (doctorId: string) {
        const doctor = await this.prisma.doctor.findUnique({
            where: { id: doctorId },
            select: {
                id: true,
                user: { select: { firstName: true, lastName: true } },
                licenseNo: true,
                specialization: true,
                yearOfExperience: true,
                recurringAvailability: true,
                customAvailability: true
            },
        });

        if (!doctor) throw new NotFoundException("Doctor not found");
        return { doctor };
    }
}
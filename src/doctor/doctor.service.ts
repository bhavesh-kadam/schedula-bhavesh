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

    /**
 * Core dynamic chunk generator that converts a start and end window into discrete booking slots.
 * Accounts for shifting string-based times and full standard JS Dates safely.
 */
private sliceTimeIntoSlots(startTimeStr: string, endTimeStr: string, durationMinutes: number, targetDateStr: string): { start: Date; end: Date }[] {
    const slots: { start: Date; end: Date }[] = [];
    
    // Construct real comparison baseline dates using the targeted calendar date
    const startBasetime = new Date(`${targetDateStr}T${startTimeStr}:00Z`);
    const endBasetime = new Date(`${targetDateStr}T${endTimeStr}:00Z`);

    let currentTrack = new Date(startBasetime.getTime());

    while (currentTrack.getTime() + durationMinutes * 60000 <= endBasetime.getTime()) {
        const nextTrack = new Date(currentTrack.getTime() + durationMinutes * 60000);
        slots.push({
            start: new Date(currentTrack),
            end: nextTrack
        });
        currentTrack = nextTrack;
    }

    return slots;
}

async generateAndFilterSlots(doctorId: string, dateString: string, duration: number) {
    // 1. Verify Doctor Existence
    const doctorExists = await this.prisma.doctor.findUnique({
        where: { id: doctorId }
    });
    if (!doctorExists) {
        throw new NotFoundException("Doctor not found");
    }

    // 2. Validate Target Date Boundaries
    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) {
        throw new BadRequestException("Invalid date format provided");
    }

    const todayString = new Date().toISOString().split('T')[0];
    if (dateString < todayString) {
        throw new BadRequestException("Cannot check slots for a past calendar date");
    }

    // Capture precise system time context for parsing future-only availability
    const systemNow = new Date();

    let baselineWindows: { startTime: string; endTime: string }[] = [];

    // 3. Resolve Availability Matrix (Custom Override priority over Weekly Recurring)
    const customOverrides = await this.prisma.customAvailability.findMany({
        where: { doctorId, date: new Date(dateString) }
    });

    if (customOverrides.length > 0) {
        const blockedDay = customOverrides.find(o => o.overrideType === OverrideType.UNAVAILABLE);
        if (blockedDay) {
            throw new BadRequestException("The doctor has declared themselves unavailable on this selected date");
        }

        const validCustomOverrides = customOverrides.filter(
            (o): o is typeof customOverrides[number] & { startTime: Date; endTime: Date } =>
                o.startTime !== null && o.endTime !== null
        );

        baselineWindows = validCustomOverrides.map(o => {
            const sIso = o.startTime.toISOString();
            const eIso = o.endTime.toISOString();
            return {
                startTime: sIso.substring(11, 16), // Extract "HH:mm" from raw database timestamp
                endTime: eIso.substring(11, 16)
            };
        });
    } else {
        // Fall back to mapping calendar dates back into active Day-of-Week enums
        const daysMapping: Record<number, Day> = {
            0: Day.SUNDAY, 1: Day.MONDAY, 2: Day.TUESDAY, 
            3: Day.WEDNESDAY, 4: Day.THURSDAY, 5: Day.FRIDAY, 6: Day.SATURDAY
        };
        const targetDayOfWeek = daysMapping[targetDate.getUTCDay()];

        const recurringWindows = await this.prisma.recurringAvailability.findMany({
            where: { doctorId, dayOfWeek: targetDayOfWeek }
        });

        baselineWindows = recurringWindows.map(r => ({
            startTime: r.startTime,
            endTime: r.endTime
        }));
    }

    if (baselineWindows.length === 0) {
        return { date: dateString, slots: [], message: "No operational availability scheduled for this date" };
    }

    // 4. Transform Scheduled Windows Into Raw Interval Blocks
    let rawGeneratedSlots: { start: Date; end: Date }[] = [];
    for (const window of baselineWindows) {
        const sliced = this.sliceTimeIntoSlots(window.startTime, window.endTime, duration, dateString);
        rawGeneratedSlots = [...rawGeneratedSlots, ...sliced];
    }

    // 5. Gather Active Appointments to Filter Out Already Booked Slots
    // 5. Gather Active Appointments to Filter Out Already Booked Slots
    const dayStart = new Date(`${dateString}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateString}T23:59:59.999Z`);

    const existingAppointments = await this.prisma.appointment.findMany({
        where: {
            doctorId,
            appointmentStatus: { in: ['BOOKED', 'RESCHEDULED', 'COMPLETED'] },
            // Filter appointments that occur within the target date
            startTime: {
                gte: dayStart,
                lte: dayEnd
            }
        },
        select: { startTime: true, endTime: true }
    });

    // 6. Execute Filtration Matrix (Strip Past Windows & Booked Slots)
    const bookableSlots = rawGeneratedSlots.filter(slot => {
        // Check 1: Ensure slot is strictly in the future relative to the system clock
        if (slot.start.getTime() <= systemNow.getTime()) {
            return false;
        }

        // Check 2: Confirm slot does not collide with an active appointment segment
        const isCollision = existingAppointments.some(appt => {
            const apptStart = new Date(appt.startTime).getTime();
            const apptEnd = new Date(appt.endTime).getTime();
            const slotStart = slot.start.getTime();
            const slotEnd = slot.end.getTime();
            
            // Overlap boundary condition logic
            return slotStart < apptEnd && slotEnd > apptStart;
        });

        return !isCollision;
    });

    return {
        date: dateString,
        configDurationMinutes: duration,
        totalAvailableSlots: bookableSlots.length,
        slots: bookableSlots.map(s => ({
            startTime: s.start.toISOString(),
            endTime: s.end.toISOString(),
            displayTime: `${s.start.toISOString().substring(11, 16)} - ${s.end.toISOString().substring(11, 16)}`
        }))
    };
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
                consultationFee: dto.consultationFee,
                yearOfExperience: dto.yearsOfExperience,
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
    }

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
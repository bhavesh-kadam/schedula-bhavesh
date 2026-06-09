import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ActiveStatus, Role } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetDoctorsQueryDto, SaveProfileDto, UpdateProfileDto } from './dto/doctor-profile.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class DoctorService {
    constructor(
        private prisma: PrismaService
    ) {}

    async fetchDoctorProfile (userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                gender: true,
                dob: true,
            }
        });

        if (!user) {
            throw new UnauthorizedException("No user data found for this account");
        }

        if (user.role !== Role.DOCTOR) {
            throw new ForbiddenException("You are not authorized to access this resources");
        }

        return {
            user
        }
    }

    async saveDoctorProfile ( dto: SaveProfileDto, userId: string) {

        const existingDoctor = await this.prisma.doctor.findUnique({
            where: {userId},
            select: {id: true}
        });

        if (existingDoctor) {
            throw new ConflictException("Doctor profile already exists");
        }

        const result = await this.prisma.doctor.create({
            data: {
                licenseNo: dto.licenseNo,
                specialization: dto.specialization,
                qualification: dto.qualification,
                yearOfExperience: dto.yearsOfExperience,
                consultationFee: dto.consultationFee,
                profileDetails: dto.profileDetails ?? null,
                userId,

                availability: {
                    createMany: {
                        data: dto.availability.map( a => ({
                            dayOfWeek: a.dayOfWeek,
                            startHour: a.startHour,
                            endHour: a.endHour,
                        }))
                    }
                }
            }
        });

        return { result }
    }

    async updateDoctorProfile (dto: UpdateProfileDto, userId: string) {

        const doctor = await this.prisma.doctor.findUnique({
            where: {userId},
            select: {id: true}
        });

        if (!doctor) {
            throw new UnauthorizedException("Could not verify doctor account, please verify your role")
        }

        const result = await this.prisma.doctor.update({
            where: {userId},
            data: {
                specialization: dto.specialization,
                qualification: dto.qualification,
                yearOfExperience: dto.yearsOfExperience,
                consultationFee: dto.consultationFee,
                activeStatus: dto.activeStatus,
                profileDetails: dto.profileDetails ?? null,
            }
        });

        await Promise.all(
            dto.availability.map( a => this.prisma.availability.upsert ({
                where: {
                    doctorId_dayOfWeek: {
                        doctorId: doctor.id,
                        dayOfWeek: a.dayOfWeek,
                    },
                },
                update: {
                    startHour: a.startHour,
                    endHour: a.endHour,
                },
                create: {
                    doctorId: doctor.id,
                    dayOfWeek: a.dayOfWeek,
                    startHour: a.startHour,
                    endHour: a.endHour
                }
            }))
        )

        const updatedAvailibility = await this.prisma.availability.findMany({
            where: { doctorId: doctor.id},
        });

        return { result, updatedAvailibility };
    }

    async getDoctors ( query: GetDoctorsQueryDto) {
        const {
            specialization,
            search,
            availability,
            page = 1,
            limit = 10,
        } = query;

        const where: Prisma.DoctorWhereInput = {};

        if (specialization) {
            where.specialization = {
                equals: specialization,
                mode: 'insensitive',
            }
        }

        if (search) {
            where.OR = [
                {
                    user: {
                        firstName: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                },
                {
                    user: {
                        lastName: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                },
            ];
        }

        if (availability === true) {
            where.activeStatus = ActiveStatus.ACTIVE;
        }

        const doctor = await this.prisma.doctor.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            include: {
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        return doctor.map((doctor) => ({
            doctorId: doctor.id,
            fullName: `${doctor.user.firstName} ${doctor.user.lastName}`,
            specialization: doctor.specialization,
            experience: doctor.yearOfExperience,
            consultationFee: doctor.consultationFee,
            availabilityStatus: doctor.activeStatus === ActiveStatus.ACTIVE,
        }));
        
    }

    async getDoctorById (doctorId: string) {
        const doctor = await this.prisma.doctor.findUnique({
            where: {
                id: doctorId,
            },
            select: {
                id: true,
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                    },
                },
                licenseNo: true,
                specialization: true,
                yearOfExperience: true,
                consultationFee: true,
                availability: true,
            },
        });

        if (!doctor) {
            throw new NotFoundException("Doctor not found");
        }

        return { doctor }
    }
}

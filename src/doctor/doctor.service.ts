import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveProfileDto, UpdateProfileDto } from './dto/doctor-profile.dto';

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

}

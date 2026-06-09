import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { PatientProfileDto } from './dto/patient-profile.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PatientService {
    constructor(
        private prisma: PrismaService
    ) {}

    async fetchPatientProfile (userId: string) {

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

        if (user.role !== Role.PATIENT) {
            throw new ForbiddenException("You are not authorized to access this resources");
        }

        return {
            user
        }
    }


    async savePatientProfile (dto: PatientProfileDto, userId: string) {

        const existingPatient = await this.prisma.patient.findUnique({
            where: {userId}, 
            select: {id: true},
        });

        if (existingPatient) {
            throw new ConflictException("Patient profile already exist");
        }

        const pid = uuidv4() as string

        const result = await this.prisma.patient.create({
            data: {
                // planned to use human convenient values later, 
                // such as MNJ0923KQ instead of full uuids
                pid, 
                bloodGroup: dto.bloodGroup,
                pastIllness: dto.pastIllness,
                userId,
            }
        });

        return { result }
    }

    async updatePatientProfile(dto: PatientProfileDto, userId: string) {

        const patient = await this.prisma.patient.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!patient) {
            throw new UnauthorizedException(
            "Could not verify patient account, please check signed in role"
            );
        }

        const result = await this.prisma.patient.update({
            where: { userId },
            data: {
            pastIllness: dto.pastIllness,
            bloodGroup: dto.bloodGroup,
            user: {
                update: {
                ...(dto.firstName && { firstName: dto.firstName }),
                ...(dto.lastName && { lastName: dto.lastName }),
                ...(dto.mobileNo && { mobileNo: dto.mobileNo }),
                ...(dto.dob && { dob: dto.dob }),
                ...(dto.gender && { gender: dto.gender }),
                }
            }
            }
        });

        return { result };
    }

}

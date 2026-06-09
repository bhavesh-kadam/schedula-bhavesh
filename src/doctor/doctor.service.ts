import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';

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

}

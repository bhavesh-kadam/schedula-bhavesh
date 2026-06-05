import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as argon from 'argon2'
import { Prisma, Role } from 'src/generated/prisma/client';
import { JwtService } from '@nestjs/jwt';
import 'dotenv/config'
import { createHmac } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
    ) {}

    async signToken( 
        userId: string, 
        firstName: string,
        email: string,
        role: Role,
    ) {

        const jti = uuidv4();
        const payload = {
            sub: userId,
            jti,
            firstName,
            email,
            role,
        }

        if (!process.env.ACCESS_TOKEN_SECRET && !process.env.REFRESH_TOKEN_SECRET) {
            return console.log("cant find env variables")
        }

        const accessToken = await this.jwt.signAsync(payload, {
            expiresIn: "15m",
            secret: process.env.ACCESS_TOKEN_SECRET,
        });

        const refreshToken = await this.jwt.signAsync(payload, {
            expiresIn: "7d",
            secret: process.env.REFRESH_TOKEN_SECRET,
        });

        return {
            accessToken: accessToken,
            refreshToken: refreshToken,
            jti: jti,
        }
    }

    async saveRefreshToken (
        userId: string,
        jti: string,
        refreshToken: string,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx || this.prisma;

        if (!process.env.HMAC_HASH) {
            console.error ('Hmac hash not found');
        }

        const tokenHash = createHmac('sha256', process.env.HMAC_HASH!)
            .update(refreshToken)
            .digest('hex')
        
        await client.refreshToken.create({
            data: {
                id: jti,
                tokenHash,
                userId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }
        });
    }

    async signUp (dto: RegisterDto) {

        const existingUser = await this.prisma.user.findUnique({
            where: {
                email: dto.email
            }
        });

        const hash = await argon.hash(dto.password)
        const mobileNo = String(dto.mobileNo)

        try {
            if (!existingUser) {
                const userAction = await this.prisma.$transaction( async (tx) => {
                    const user = await tx.user.create({
                        data: {
                            firstName: dto.firstName,
                            lastName: dto.lastName,
                            mobileNo: mobileNo,
                            email: dto.email,
                            dob: dto.dob,
                            role: dto.role,
                            gender: dto.gender,
                            hash,
                        },
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            createdAt: true,
                            updatedAt: true,
                            role: true
                        }
                    })

                    return user;
                })

                const tokens = await this.signToken(
                    userAction.id,
                    userAction.firstName,
                    userAction.email,
                    userAction.role,
                );

                if (!tokens) {return console.error("failed to generate tokens")}

                await this.saveRefreshToken(userAction.id, tokens.jti, tokens.refreshToken)

                return tokens;
            }
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw new ForbiddenException('Email already in use');
            }
            throw err;
        }
    }
}

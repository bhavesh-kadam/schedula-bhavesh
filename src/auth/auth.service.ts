import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as argon from 'argon2'
import { Prisma, Role } from 'src/generated/prisma/client';
import { JwtService } from '@nestjs/jwt';
import 'dotenv/config'
import { createHmac } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from './dto/login.dto';

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

                // i dont return token after sign up, rather after login, this was just for testing
                // let me know you convention, i can alter my code to retrn tokens after sign up also

                // const tokens = await this.signToken(
                //     userAction.id,
                //     userAction.firstName,
                //     userAction.email,
                //     userAction.role,
                // );

                // if (!tokens) {return console.error("failed to generate tokens")}

                // await this.saveRefreshToken(userAction.id, tokens.jti, tokens.refreshToken)

                // return tokens;

                return {
                    messge: "Accout created successfully, please login as next step"
                }
            }
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw new ForbiddenException('Email already in use');
            }
            throw err;
        }
    }

    async login (dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: {email: dto.email},
            select: {
                id: true,
                firstName: true,
                lastName: true,
                hash: true,
                email: true,
                role: true,
            }
        });

        if (!user) {
            throw new ForbiddenException("Invalid Credentials")
        }

        const pwMatch = argon.verify(user.hash, dto.password);

        if (!pwMatch) {
            throw new ForbiddenException("Invalid credentials");
        }

        const tokens = await this.signToken(user.id, user.firstName, user.email, user.role);

        if (!tokens) { throw new Error("failed to generate tokens")};

        await this.saveRefreshToken(user.id, tokens.jti, tokens.refreshToken)

        return {
            ...tokens,
            user: {
                id: user.id,
                firstName: user.firstName,
                lasName: user.lastName,
                role: user.role,
            }
        }
        
    }
}

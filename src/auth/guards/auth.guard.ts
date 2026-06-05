import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "src/prisma/prisma.service";
import 'dotenv/config';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor (
        private jwt: JwtService,
        private prisma: PrismaService
    ) {}


    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const cookie = request.cookies;
        const primaryTokenRetrival = cookie.accessToken;
        let secondTokenRetrival: string | undefined;
        if (!primaryTokenRetrival) {
            try {
                secondTokenRetrival = this.extractTokenFromHeader(request);
            } catch (err) {
                console.error(err);
                throw new ForbiddenException("Login first to continue")
            }
        }

        const token = primaryTokenRetrival ?? secondTokenRetrival;

        try{
            const payload = await this.jwt.verifyAsync(token, {secret: process.env.ACCESS_TOKEN_SECRET});

            const session = await this.prisma.refreshToken.findUnique({
                where: { id: payload.jti },
                select: {revokedAt: true},
            });

            if (!session || session.revokedAt) {
                throw new UnauthorizedException("Invalid Session");
            }

            request['user'] = payload;
        } catch (err) {
            throw new UnauthorizedException("Invalid or expired token");
        }

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
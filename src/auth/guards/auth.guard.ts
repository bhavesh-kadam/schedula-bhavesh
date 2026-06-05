import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import 'dotenv/config';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor (
        private jwt: JwtService,
    ) {}


    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const cookie = request.cookies;
        const primaryTokenRetrival = cookie.access_token;

        const token = primaryTokenRetrival ?? this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException("Login first to continue");
        }

        try{
            const payload = await this.jwt.verifyAsync(token, {secret: process.env.ACCESS_TOKEN_SECRET});
            request.user = payload;

            return true;

        } catch (err) {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
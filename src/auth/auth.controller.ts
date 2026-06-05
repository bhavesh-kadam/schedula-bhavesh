import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async createAccount (
    @Body() dto: RegisterDto,
    @Res({ passthrough: true}) res: Response,
  ) {
    const tokens = await this.authService.signUp(dto);

    if (!tokens) { return }
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
  }


  private setCookies(res: Response, access: string, refresh: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const commonOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
    };

    res.cookie('access_token', access, commonOptions);
    res.cookie('refresh_token', refresh, commonOptions);
  }
}

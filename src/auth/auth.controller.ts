import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async createAccount (
    @Body() dto: RegisterDto,
    @Res({ passthrough: true}) res: Response,
  ) {
    const action = await this.authService.signUp(dto);

    // if (!tokens) { return }
    // this.setCookies(res, tokens.accessToken, tokens.refreshToken);

    if (action) {
      return {
        message: 'Account created successfully, log in to continue'
      }
    }else {
      return {
        error: "Failed to create a new account, try with new email or after some time"
      }
    }
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(dto);

    if (!accessToken && !refreshToken) return;

    this.setCookies( res, accessToken, refreshToken);

    return {
      message: 'Logged in',
      user: user,
    }
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

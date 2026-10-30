import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, LoginDto, RegisterDto } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    // Public self-registration is always a participant; staff roles are granted by admins only.
    const { handle, email, password, teamName } = dto ?? ({} as RegisterDto);
    return this.authService.register({ handle, email, password, teamName });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    const isSecure =
      process.env.COOKIE_SECURE === 'true' ||
      process.env.NODE_ENV === 'production';

    res.cookie('rv_session', result.sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.['rv_session'];
    await this.authService.logout(sessionId);

    res.clearCookie('rv_session', {
      httpOnly: true,
      path: '/',
    });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser | null) {
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return {
      id: user.id,
      handle: user.handle,
      roles: user.roles,
      team: user.team || null,
    };
  }

  @Public()
  @Get('csrf')
  async getCsrf(@Req() req: Request) {
    return {
      csrfToken: req.cookies?.['rv_csrf'] || '',
    };
  }
}

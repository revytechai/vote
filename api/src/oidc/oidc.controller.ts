import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth/oidc')
export class OidcController {
  private isOidcEnabled(): boolean {
    return Boolean(process.env.OIDC_ISSUER?.trim());
  }

  @Public()
  @Get('status')
  getStatus() {
    if (!this.isOidcEnabled()) {
      return { enabled: false };
    }
    return {
      enabled: true,
      issuer: process.env.OIDC_ISSUER,
    };
  }

  @Public()
  @Get('login')
  login(@Res() res: Response) {
    if (!this.isOidcEnabled()) {
      throw new NotFoundException('OIDC authentication is not configured');
    }
    const issuer = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID || 'revytechai-vote';
    const redirectUri = encodeURIComponent('/api/v1/auth/oidc/callback');
    const authUrl = `${issuer}/protocol/openid-connect/auth?client_id=${clientId}&response_type=code&scope=openid%20profile%20email&redirect_uri=${redirectUri}`;
    return res.redirect(authUrl);
  }

  @Public()
  @Get('callback')
  callback(@Query('code') code: string) {
    if (!this.isOidcEnabled()) {
      throw new NotFoundException('OIDC authentication is not configured');
    }
    return {
      message: 'OIDC callback stub received',
      code: code || null,
      issuer: process.env.OIDC_ISSUER,
    };
  }
}

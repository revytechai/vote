import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!req.cookies?.['rv_csrf']) {
      const token = crypto.randomBytes(24).toString('hex');
      const isSecure =
        process.env.COOKIE_SECURE === 'true' ||
        process.env.NODE_ENV === 'production';
      res.cookie('rv_csrf', token, {
        httpOnly: false,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
      });
      // also set on req.cookies so handlers in this same request can see it
      req.cookies = req.cookies || {};
      req.cookies['rv_csrf'] = token;
    }
    next();
  }
}

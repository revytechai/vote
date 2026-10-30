import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OidcModule } from './oidc/oidc.module';
import { TeamsModule } from './teams/teams.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { CodesModule } from './codes/codes.module';
import { EventsModule } from './events/events.module';
import { RoundsModule } from './rounds/rounds.module';
import { PrizesModule } from './prizes/prizes.module';
import { TallyModule } from './tally/tally.module';
import { HealthModule } from './health/health.module';

import { CsrfGuard } from './common/guards/csrf.guard';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { SessionMiddleware } from './common/middleware/session.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: Number.parseInt(process.env.THROTTLE_TTL || '60000', 10),
        limit: Number.parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),
    PrismaModule,
    TallyModule,
    AuthModule,
    OidcModule,
    TeamsModule,
    SubmissionsModule,
    CodesModule,
    EventsModule,
    RoundsModule,
    PrizesModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParser()).forRoutes('*');
    consumer
      .apply(CsrfMiddleware, SessionMiddleware)
      .exclude('api/health')
      .forRoutes('*');
  }
}

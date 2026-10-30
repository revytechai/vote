import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { EventsService, ProposeIdeaDto } from './events.service';
import { SubmissionsService, CreateSubmissionDto } from '../submissions/submissions.service';
import { CodesService } from '../codes/codes.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly submissionsService: SubmissionsService,
    private readonly codesService: CodesService,
  ) {}

  @Public()
  @Get()
  async listEvents() {
    return this.eventsService.listPublicEvents();
  }

  @Public()
  @Get(':slug')
  async getEvent(@Param('slug') slug: string) {
    return this.eventsService.getEvent(slug);
  }

  @Public()
  @Get(':slug/ideas')
  async listIdeas(@Param('slug') slug: string) {
    return this.eventsService.listIdeas(slug);
  }

  @Public()
  @Post(':slug/ideas')
  @HttpCode(HttpStatus.CREATED)
  async proposeIdea(
    @Param('slug') slug: string,
    @Body() dto: ProposeIdeaDto,
  ) {
    return this.eventsService.proposeIdea(slug, dto);
  }

  @Public()
  @Get(':slug/rounds')
  async listRounds(@Param('slug') slug: string) {
    return this.eventsService.listRounds(slug);
  }

  @Public()
  @Get(':slug/submissions')
  async listSubmissions(@Param('slug') slug: string) {
    return this.submissionsService.listApprovedForEvent(slug);
  }

  @Post(':slug/submissions')
  @HttpCode(HttpStatus.CREATED)
  async createSubmission(
    @Param('slug') slug: string,
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    if (!user) {
      throw new UnauthorizedException('Participant session required');
    }
    return this.submissionsService.createSubmission(slug, dto, user);
  }

  @Public()
  @Get(':slug/prizes')
  async listPrizes(@Param('slug') slug: string) {
    return this.eventsService.listPrizes(slug);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post(':slug/join')
  @HttpCode(HttpStatus.NO_CONTENT)
  async join(
    @Param('slug') slug: string,
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.codesService.joinWithCode(slug, code);

    const isSecure =
      process.env.COOKIE_SECURE === 'true' ||
      process.env.NODE_ENV === 'production';

    res.cookie('rv_session', session.sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
  }
}

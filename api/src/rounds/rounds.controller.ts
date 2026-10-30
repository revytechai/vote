import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  Sse,
} from '@nestjs/common';
import { Observable, concat, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoundsService, CastBallotDto } from './rounds.service';
import { Public } from '../common/decorators/public.decorator';
import { BallotSession, BallotSessionData } from '../common/decorators/ballot-session.decorator';

@Controller('rounds')
export class RoundsController {
  constructor(private readonly roundsService: RoundsService) {}

  @Get(':id/ballot')
  async getBallot(
    @Param('id', ParseIntPipe) id: number,
    @BallotSession() session: BallotSessionData | null,
  ) {
    return this.roundsService.getBallot(id, session);
  }

  @Put(':id/ballot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async castBallot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CastBallotDto,
    @BallotSession() session: BallotSessionData | null,
  ) {
    await this.roundsService.castBallot(id, dto, session);
  }

  @Public()
  @Get(':id/results')
  async getResults(@Param('id', ParseIntPipe) id: number) {
    return this.roundsService.getResults(id);
  }

  @Public()
  @Sse(':id/results/stream')
  async streamResults(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Observable<{ data: string }>> {
    // Check access: will throw 403 if results are hidden
    const initialResult = await this.roundsService.getResults(id);

    const initial$ = from([initialResult]);
    const live$ = this.roundsService.getResultsStream(id);

    return concat(initial$, live$).pipe(
      map((result) => ({
        data: JSON.stringify(result),
      })),
    );
  }
}

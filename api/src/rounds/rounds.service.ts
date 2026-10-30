import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { Subject, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TallyService, ApiRoundResult } from '../tally/tally.service';
import { BallotSessionData } from '../common/decorators/ballot-session.decorator';

export interface CreateRoundDto {
  name: string;
  category?: string;
  method?: string; // star, score, approval
  status?: string; // draft, open, closed
  results_visible?: boolean;
  max_score?: number;
}

export interface UpdateRoundDto {
  name?: string;
  category?: string;
  method?: string;
  status?: string;
  results_visible?: boolean;
  max_score?: number;
}

export interface CastBallotDto {
  scores: Record<string | number, number>;
}

@Injectable()
export class RoundsService {
  private readonly roundUpdateSubjects = new Map<number, Subject<ApiRoundResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tallyService: TallyService,
  ) {}

  private getSubjectForRound(roundId: number): Subject<ApiRoundResult> {
    let subject = this.roundUpdateSubjects.get(roundId);
    if (!subject) {
      subject = new Subject<ApiRoundResult>();
      this.roundUpdateSubjects.set(roundId, subject);
    }
    return subject;
  }

  async createRound(eventSlug: string, dto: CreateRoundDto) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    if (!dto.name?.trim()) {
      throw new BadRequestException('Round name is required');
    }

    const method = dto.method || 'star';
    if (!['star', 'score', 'approval'].includes(method)) {
      throw new BadRequestException(`Invalid method: ${method}`);
    }

    const status = dto.status || 'draft';
    if (!['draft', 'open', 'closed'].includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const round = await this.prisma.round.create({
      data: {
        eventId: event.id,
        name: dto.name.trim(),
        category: dto.category || null,
        method,
        status,
        resultsVisible: dto.results_visible ?? false,
        maxScore: dto.max_score ?? 5,
      },
    });

    return {
      id: round.id,
      event: event.slug,
      name: round.name,
      category: round.category,
      method: round.method,
      status: round.status,
      results_visible: round.resultsVisible,
      max_score: round.maxScore,
    };
  }

  async updateRound(id: number, dto: UpdateRoundDto) {
    const round = await this.prisma.round.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!round) {
      throw new NotFoundException(`Round ${id} not found`);
    }

    if (dto.method && !['star', 'score', 'approval'].includes(dto.method)) {
      throw new BadRequestException(`Invalid method: ${dto.method}`);
    }
    if (dto.status && !['draft', 'open', 'closed'].includes(dto.status)) {
      throw new BadRequestException(`Invalid status: ${dto.status}`);
    }

    const updated = await this.prisma.round.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        category: dto.category ?? undefined,
        method: dto.method ?? undefined,
        status: dto.status ?? undefined,
        resultsVisible: dto.results_visible ?? undefined,
        maxScore: dto.max_score ?? undefined,
      },
      include: { event: true },
    });

    // Notify SSE subscribers of results update if results visible or closed
    if (updated.resultsVisible || updated.status === 'closed') {
      this.getResults(updated.id).then((res) => {
        this.getSubjectForRound(updated.id).next(res);
      }).catch(() => {});
    }

    return {
      id: updated.id,
      event: updated.event.slug,
      name: updated.name,
      category: updated.category,
      method: updated.method,
      status: updated.status,
      results_visible: updated.resultsVisible,
      max_score: updated.maxScore,
    };
  }

  async getBallot(roundId: number, session: BallotSessionData | null) {
    if (!session?.codeHash) {
      throw new ForbiddenException('Valid ballot session required (join first)');
    }

    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    const ballot = await this.prisma.ballot.findUnique({
      where: {
        roundId_codeHash: {
          roundId,
          codeHash: session.codeHash,
        },
      },
      include: {
        votes: true,
      },
    });

    if (!ballot) {
      return { scores: {} };
    }

    const scores: Record<number, number> = {};
    for (const v of ballot.votes) {
      scores[v.submissionId] = v.score;
    }

    return { scores };
  }

  async castBallot(
    roundId: number,
    dto: CastBallotDto,
    session: BallotSessionData | null,
  ) {
    if (!session?.codeHash) {
      throw new ForbiddenException('Valid ballot session required (join first)');
    }

    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { event: true },
    });
    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    if (round.status === 'closed') {
      throw new ConflictException('Round is closed');
    }
    if (round.status !== 'open') {
      throw new BadRequestException('Round is not currently open for voting');
    }

    if (session.eventId && session.eventId !== round.eventId) {
      throw new ForbiddenException('Invite code is not valid for this event round');
    }

    const rawScores = dto.scores || {};
    const maxScore = round.method === 'approval' ? 1 : round.maxScore;

    // Validate scores
    for (const [subIdStr, score] of Object.entries(rawScores)) {
      const subId = Number.parseInt(subIdStr, 10);
      if (Number.isNaN(subId)) {
        throw new BadRequestException(`Invalid submission id: ${subIdStr}`);
      }
      if (
        typeof score !== 'number' ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > maxScore
      ) {
        throw new BadRequestException(
          `Score for submission ${subId} must be an integer between 0 and ${maxScore} (got ${score})`,
        );
      }
    }

    // Upsert ballot (one per code per round, replaceable until round close)
    const ballot = await this.prisma.ballot.upsert({
      where: {
        roundId_codeHash: {
          roundId,
          codeHash: session.codeHash,
        },
      },
      create: {
        roundId,
        codeHash: session.codeHash,
      },
      update: {},
    });

    // Replace votes
    await this.prisma.ballotVote.deleteMany({
      where: { ballotId: ballot.id },
    });

    const voteEntries = Object.entries(rawScores).map(([subIdStr, score]) => ({
      ballotId: ballot.id,
      submissionId: Number.parseInt(subIdStr, 10),
      score,
    }));

    if (voteEntries.length > 0) {
      await this.prisma.ballotVote.createMany({
        data: voteEntries,
      });
    }

    // Trigger SSE results update if results visible
    if (round.resultsVisible) {
      this.getResults(round.id).then((res) => {
        this.getSubjectForRound(round.id).next(res);
      }).catch(() => {});
    }
  }

  async getResults(roundId: number): Promise<ApiRoundResult> {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: {
        event: true,
        ballots: {
          include: { votes: true },
        },
      },
    });

    if (!round) {
      throw new NotFoundException(`Round ${roundId} not found`);
    }

    // Results are hidden (403) unless results_visible or closed
    if (!round.resultsVisible && round.status !== 'closed') {
      throw new ForbiddenException(
        'Results are hidden until round closes or results are made visible',
      );
    }

    // Load all approved submissions for this round's event
    const submissions = await this.prisma.submission.findMany({
      where: {
        eventId: round.eventId,
        status: 'approved',
      },
      select: { id: true, title: true },
      orderBy: { id: 'asc' },
    });

    const ballotsData: Array<Record<number, number>> = round.ballots.map((b) => {
      const map: Record<number, number> = {};
      for (const v of b.votes) {
        map[v.submissionId] = v.score;
      }
      return map;
    });

    return this.tallyService.computeTally(
      round.id,
      round.method,
      round.status === 'closed',
      submissions,
      ballotsData,
      { maxScore: round.maxScore },
    );
  }

  getResultsStream(roundId: number): Observable<ApiRoundResult> {
    return this.getSubjectForRound(roundId).asObservable();
  }

  async exportCsv(roundId: number): Promise<string> {
    const results = await this.getResults(roundId);
    const data = results.rows.map((row) => ({
      rank: row.rank,
      submission_id: row.submission_id,
      title: row.title,
      total: row.total,
      mean: row.mean.toFixed(2),
    }));

    return stringify(data, { header: true });
  }
}

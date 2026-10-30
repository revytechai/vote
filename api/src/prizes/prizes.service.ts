import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoundsService } from '../rounds/rounds.service';

export interface CreatePrizeDto {
  name: string;
  sponsor: string;
  description: string;
  quantity?: number;
  category: string;
  eligibility?: string;
  round_id?: number;
}

@Injectable()
export class PrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roundsService: RoundsService,
  ) {}

  async createPrize(eventSlug: string, dto: CreatePrizeDto) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    if (!dto.name?.trim()) {
      throw new BadRequestException('Prize name is required');
    }

    const prize = await this.prisma.prize.create({
      data: {
        eventId: event.id,
        name: dto.name.trim(),
        sponsor: dto.sponsor?.trim() || 'Anonymous',
        description: dto.description || '',
        quantity: dto.quantity && dto.quantity > 0 ? dto.quantity : 1,
        category: dto.category || 'General',
        eligibility: dto.eligibility || null,
        roundId: dto.round_id || null,
      },
    });

    return {
      id: prize.id,
      name: prize.name,
      sponsor: prize.sponsor,
      description: prize.description,
      quantity: prize.quantity,
      category: prize.category,
      eligibility: prize.eligibility,
      round_id: prize.roundId,
      awards: [],
    };
  }

  async getSuggestedWinners(prizeId: number) {
    const prize = await this.prisma.prize.findUnique({
      where: { id: prizeId },
      include: {
        round: true,
        awards: {
          include: {
            submission: {
              include: { team: true },
            },
          },
        },
      },
    });

    if (!prize) {
      throw new NotFoundException(`Prize ${prizeId} not found`);
    }

    if (!prize.roundId) {
      return {
        prize_id: prize.id,
        round_id: null,
        suggested_winners: [],
        awards: prize.awards.map((a) => ({
          submission_id: a.submission.id,
          title: a.submission.title,
          team: a.submission.team?.name || '',
        })),
      };
    }

    // Get results from linked round (ignore visibility for admin suggestion)
    const submissions = await this.prisma.submission.findMany({
      where: { eventId: prize.eventId, status: 'approved' },
      select: { id: true, title: true, team: { select: { name: true } } },
    });

    const round = await this.prisma.round.findUnique({
      where: { id: prize.roundId },
    });

    if (!round) {
      return {
        prize_id: prize.id,
        round_id: prize.roundId,
        suggested_winners: [],
      };
    }

    // The tally is computed by RoundsService from the round's own ballots.
    const results = await this.roundsService.getResults(round.id).catch(() => null);

    const subTeamMap = new Map(
      submissions.map((s) => [s.id, s.team?.name || '']),
    );

    const suggested = (results?.rows || []).slice(0, prize.quantity).map((r) => ({
      submission_id: r.submission_id,
      title: r.title,
      team: subTeamMap.get(r.submission_id) || '',
      rank: r.rank,
      total: r.total,
    }));

    return {
      prize_id: prize.id,
      name: prize.name,
      quantity: prize.quantity,
      round_id: prize.roundId,
      suggested_winners: suggested,
      awards: prize.awards.map((a) => ({
        submission_id: a.submission.id,
        title: a.submission.title,
        team: a.submission.team?.name || '',
      })),
    };
  }

  async awardPrize(prizeId: number, submissionId: number) {
    const prize = await this.prisma.prize.findUnique({
      where: { id: prizeId },
      include: { awards: true },
    });

    if (!prize) {
      throw new NotFoundException(`Prize ${prizeId} not found`);
    }

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { team: true },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    if (submission.eventId !== prize.eventId) {
      throw new BadRequestException(
        'Submission does not belong to the same event as the prize',
      );
    }

    // Check if already awarded to this submission
    const alreadyAwarded = prize.awards.some((a) => a.submissionId === submissionId);
    if (alreadyAwarded) {
      throw new ConflictException('Prize already awarded to this submission');
    }

    // Enforce quantity limit!
    if (prize.awards.length >= prize.quantity) {
      throw new BadRequestException(
        `Cannot award prize: maximum quantity of ${prize.quantity} reached`,
      );
    }

    await this.prisma.prizeAward.create({
      data: {
        prizeId: prize.id,
        submissionId: submission.id,
      },
    });

    const updatedPrize = await this.prisma.prize.findUnique({
      where: { id: prize.id },
      include: {
        awards: {
          include: {
            submission: {
              include: { team: true },
            },
          },
        },
      },
    });

    return {
      id: updatedPrize!.id,
      name: updatedPrize!.name,
      quantity: updatedPrize!.quantity,
      awards: updatedPrize!.awards.map((a) => ({
        submission_id: a.submission.id,
        title: a.submission.title,
        team: a.submission.team?.name || '',
      })),
    };
  }
}

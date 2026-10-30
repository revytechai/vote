import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateEventDto {
  slug: string;
  title: string;
  description: string;
  proposalsOpen?: boolean;
  registrationOpen?: boolean;
  startsAt?: string | Date;
  endsAt?: string | Date;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  proposalsOpen?: boolean;
  registrationOpen?: boolean;
  startsAt?: string | Date;
  endsAt?: string | Date;
}

export interface ProposeIdeaDto {
  title: string;
  proposer: string;
  description: string;
  link: string;
  vote_points?: number;
  pres_no?: string;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  formatEvent(event: any) {
    return {
      slug: event.slug,
      title: event.title,
      description: event.description,
      proposals_open: event.proposalsOpen,
      registration_open: event.registrationOpen,
      starts_at: event.startsAt ? event.startsAt.toISOString() : null,
      ends_at: event.endsAt ? event.endsAt.toISOString() : null,
    };
  }

  async listPublicEvents() {
    const events = await this.prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
    });
    return events.map((e) => this.formatEvent(e));
  }

  async getEvent(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }
    return this.formatEvent(event);
  }

  async listIdeas(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    const ideas = await this.prisma.idea.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
    });

    return ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      proposer: idea.proposer,
      description: idea.description,
      link: idea.link,
      vote_points: idea.votePoints,
      pres_no: idea.presNo,
    }));
  }

  async proposeIdea(slug: string, dto: ProposeIdeaDto) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    if (!event.proposalsOpen) {
      throw new ForbiddenException('Proposals are closed for this event');
    }

    if (!dto.title?.trim()) {
      throw new BadRequestException('Idea title is required');
    }

    const idea = await this.prisma.idea.create({
      data: {
        eventId: event.id,
        title: dto.title.trim(),
        proposer: dto.proposer?.trim() || 'Anonymous',
        description: dto.description || '',
        link: dto.link || '',
        votePoints: dto.vote_points ?? null,
        presNo: dto.pres_no !== undefined ? String(dto.pres_no) : null,
      },
    });

    return {
      id: idea.id,
      title: idea.title,
      proposer: idea.proposer,
      description: idea.description,
      link: idea.link,
      vote_points: idea.votePoints,
      pres_no: idea.presNo,
    };
  }

  async listRounds(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    const rounds = await this.prisma.round.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
    });

    return rounds.map((r) => ({
      id: r.id,
      event: event.slug,
      name: r.name,
      category: r.category,
      method: r.method,
      status: r.status,
      results_visible: r.resultsVisible,
      max_score: r.maxScore,
    }));
  }

  async listPrizes(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    const prizes = await this.prisma.prize.findMany({
      where: { eventId: event.id },
      include: {
        awards: {
          include: {
            submission: {
              include: { team: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    return prizes.map((prize) => ({
      id: prize.id,
      name: prize.name,
      sponsor: prize.sponsor,
      description: prize.description,
      quantity: prize.quantity,
      category: prize.category,
      eligibility: prize.eligibility,
      round_id: prize.roundId,
      awards: prize.awards.map((a) => ({
        submission_id: a.submission.id,
        title: a.submission.title,
        team: a.submission.team ? a.submission.team.name : '',
      })),
    }));
  }

  // Admin methods
  async createEvent(dto: CreateEventDto) {
    const slug = dto.slug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException('Event slug is required');
    }

    const existing = await this.prisma.event.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Event with slug "${slug}" already exists`);
    }

    const event = await this.prisma.event.create({
      data: {
        slug,
        title: dto.title?.trim() || slug,
        description: dto.description || '',
        proposalsOpen: dto.proposalsOpen ?? true,
        registrationOpen: dto.registrationOpen ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });

    return this.formatEvent(event);
  }

  async updateEvent(slug: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    const updated = await this.prisma.event.update({
      where: { slug },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : undefined,
        description: dto.description ?? undefined,
        proposalsOpen: dto.proposalsOpen,
        registrationOpen: dto.registrationOpen,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });

    return this.formatEvent(updated);
  }

  async deleteEvent(slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    await this.prisma.event.delete({ where: { slug } });
    return { success: true, message: `Event "${slug}" deleted` };
  }

  /**
   * Tolerant CSV import for ideas:
   * Recognizes columns: title, proposer, description, link, vote_points, pres_no
   * Tolerates varied casings, spaces, underscores, and common variations.
   */
  async importCsv(slug: string, csvContent: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event "${slug}" not found`);
    }

    if (!csvContent?.trim()) {
      throw new BadRequestException('CSV content is empty');
    }

    let records: Record<string, string>[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err: any) {
      throw new BadRequestException(`CSV parsing failed: ${err.message}`);
    }

    const normalizeHeader = (rawHeader: string): string => {
      const clean = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['title', 'name', 'ideatitle'].includes(clean)) return 'title';
      if (['proposer', 'author', 'submittedby', 'submitter'].includes(clean))
        return 'proposer';
      if (['description', 'desc', 'summary'].includes(clean))
        return 'description';
      if (['link', 'url', 'arturl', 'artifact'].includes(clean)) return 'link';
      if (['votepoints', 'votes', 'points', 'votepoint'].includes(clean))
        return 'vote_points';
      if (
        [
          'presno',
          'presentationno',
          'presentation',
          'presnum',
          'presnumber',
          'no',
        ].includes(clean)
      )
        return 'pres_no';
      return clean;
    };

    const createdIdeas: any[] = [];

    for (const row of records) {
      const normalizedRow: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalizedRow[normalizeHeader(key)] = value;
      }

      const title = normalizedRow['title']?.trim();
      if (!title) {
        continue; // skip rows without a title
      }

      const proposer = normalizedRow['proposer']?.trim() || 'Anonymous';
      const description = normalizedRow['description']?.trim() || '';
      const link = normalizedRow['link']?.trim() || '';
      const votePointsRaw = normalizedRow['vote_points'];
      const votePoints =
        votePointsRaw && !Number.isNaN(Number.parseInt(votePointsRaw, 10))
          ? Number.parseInt(votePointsRaw, 10)
          : null;
      const presNo = normalizedRow['pres_no']?.trim() || null;

      const idea = await this.prisma.idea.create({
        data: {
          eventId: event.id,
          title,
          proposer,
          description,
          link,
          votePoints,
          presNo,
        },
      });

      createdIdeas.push(idea);
    }

    return {
      imported: createdIdeas.length,
      ideas: createdIdeas.map((i) => ({
        id: i.id,
        title: i.title,
        proposer: i.proposer,
        description: i.description,
        link: i.link,
        vote_points: i.votePoints,
        pres_no: i.presNo,
      })),
    };
  }
}

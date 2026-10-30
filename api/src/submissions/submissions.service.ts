import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { assertHttpsUrl } from '../common/validators/url.validator';

export interface ArtifactInput {
  kind: string;
  url: string;
  label?: string;
}

export interface CreateSubmissionDto {
  title: string;
  summary: string;
  ideaId?: number;
  artifacts?: ArtifactInput[];
}

export interface UpdateSubmissionDto {
  title?: string;
  summary?: string;
  ideaId?: number;
  artifacts?: ArtifactInput[];
}

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateArtifacts(artifacts?: ArtifactInput[]) {
    if (!artifacts) return;
    const allowedKinds = ['repo', 'pr', 'demo', 'slides', 'other'];
    for (const artifact of artifacts) {
      if (!artifact.url) {
        throw new BadRequestException('Artifact url is required');
      }
      assertHttpsUrl(artifact.url, 'Artifact URL');
      if (artifact.kind && !allowedKinds.includes(artifact.kind)) {
        throw new BadRequestException(
          `Invalid artifact kind: ${artifact.kind}. Allowed: ${allowedKinds.join(', ')}`,
        );
      }
    }
  }

  formatSubmission(submission: any) {
    return {
      id: submission.id,
      title: submission.title,
      summary: submission.summary,
      idea_id: submission.ideaId,
      status: submission.status,
      team: submission.team
        ? {
            id: submission.team.id,
            name: submission.team.name,
            members: submission.team.members?.map((m: any) => m.handle) || [],
          }
        : null,
      artifacts: (submission.artifacts || []).map((art: any) => ({
        kind: art.kind,
        url: art.url,
        label: art.label || undefined,
      })),
    };
  }

  async createSubmission(
    eventSlug: string,
    dto: CreateSubmissionDto,
    currentUser: AuthenticatedUser,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    if (!dto.title?.trim()) {
      throw new BadRequestException('Submission title is required');
    }

    this.validateArtifacts(dto.artifacts);

    const submission = await this.prisma.submission.create({
      data: {
        eventId: event.id,
        title: dto.title.trim(),
        summary: dto.summary || '',
        userId: currentUser.id,
        teamId: currentUser.teamId || null,
        ideaId: dto.ideaId || null,
        status: 'pending',
        artifacts: {
          create: (dto.artifacts || []).map((art) => ({
            kind: art.kind || 'other',
            url: art.url.trim(),
            label: art.label || null,
          })),
        },
      },
      include: {
        team: { include: { members: { select: { handle: true } } } },
        artifacts: true,
      },
    });

    return this.formatSubmission(submission);
  }

  async updateOwnSubmission(
    id: number,
    dto: UpdateSubmissionDto,
    currentUser: AuthenticatedUser,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        team: { include: { members: { select: { id: true, handle: true } } } },
      },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }

    const isAuthor = submission.userId === currentUser.id;
    const isTeamMember =
      submission.team?.members.some((m) => m.id === currentUser.id);
    const isStaff = currentUser.roles.some((r) =>
      ['superuser', 'manager'].includes(r),
    );

    if (!isAuthor && !isTeamMember && !isStaff) {
      throw new ForbiddenException('Not the owner of this submission');
    }

    this.validateArtifacts(dto.artifacts);

    if (dto.artifacts) {
      await this.prisma.artifact.deleteMany({ where: { submissionId: id } });
      await this.prisma.artifact.createMany({
        data: dto.artifacts.map((art) => ({
          submissionId: id,
          kind: art.kind || 'other',
          url: art.url.trim(),
          label: art.label || null,
        })),
      });
    }

    const updated = await this.prisma.submission.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : undefined,
        summary: dto.summary ?? undefined,
        ideaId: dto.ideaId ?? undefined,
      },
      include: {
        team: { include: { members: { select: { handle: true } } } },
        artifacts: true,
      },
    });

    return this.formatSubmission(updated);
  }

  async moderate(id: number, status: string) {
    const validStatuses = ['pending', 'approved', 'hidden', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status: ${status}. Must be one of [${validStatuses.join(', ')}]`,
      );
    }

    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }

    const updated = await this.prisma.submission.update({
      where: { id },
      data: { status },
      include: {
        team: { include: { members: { select: { handle: true } } } },
        artifacts: true,
      },
    });

    return this.formatSubmission(updated);
  }

  async getApproved(id: number) {
    const submission = await this.prisma.submission.findFirst({
      where: { id, status: 'approved' },
      include: {
        team: { include: { members: { select: { handle: true } } } },
        artifacts: true,
      },
    });
    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }
    return this.formatSubmission(submission);
  }

  async listApprovedForEvent(eventSlug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    const submissions = await this.prisma.submission.findMany({
      where: {
        eventId: event.id,
        status: 'approved',
      },
      include: {
        team: { include: { members: { select: { handle: true } } } },
        artifacts: true,
      },
      orderBy: { id: 'asc' },
    });

    return submissions.map((sub) => this.formatSubmission(sub));
  }
}

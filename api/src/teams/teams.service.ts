import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(name: string, user: AuthenticatedUser) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('Team name is required');
    }

    const team = await this.prisma.team.create({
      data: {
        name: trimmed,
        members: {
          connect: { id: user.id },
        },
      },
      include: {
        members: {
          select: { handle: true },
        },
      },
    });

    return {
      id: team.id,
      name: team.name,
      members: team.members.map((m) => m.handle),
    };
  }

  async addMember(teamId: number, handle: string, currentUser: AuthenticatedUser) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { select: { id: true, handle: true } } },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const isMember = team.members.some((m) => m.id === currentUser.id);
    const isStaff = currentUser.roles.some((r) =>
      ['superuser', 'manager'].includes(r),
    );

    if (!isMember && !isStaff) {
      throw new ForbiddenException('Only team members or event managers can add members');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { handle: handle.trim() },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with handle "${handle}" not found`);
    }

    await this.prisma.user.update({
      where: { id: targetUser.id },
      data: { teamId: team.id },
    });

    const updated = await this.prisma.team.findUnique({
      where: { id: team.id },
      include: { members: { select: { handle: true } } },
    });

    return {
      id: updated!.id,
      name: updated!.name,
      members: updated!.members.map((m) => m.handle),
    };
  }
}

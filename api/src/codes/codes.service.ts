import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CodesService {
  constructor(private readonly prisma: PrismaService) {}

  hashCode(code: string): string {
    return crypto.createHash('sha256').update(code.trim()).digest('hex');
  }

  async generateCodes(eventSlug: string, count: number = 1) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    const n = Math.min(Math.max(1, count), 1000);
    const plaintextCodes: string[] = [];
    const createData: Array<{ eventId: number; codeHash: string }> = [];

    for (let i = 0; i < n; i++) {
      // 16-character alphanumeric code
      const code = crypto.randomBytes(8).toString('hex');
      const hash = this.hashCode(code);
      plaintextCodes.push(code);
      createData.push({
        eventId: event.id,
        codeHash: hash,
      });
    }

    // Save hashes in database
    await this.prisma.inviteCode.createMany({
      data: createData,
    });

    return { codes: plaintextCodes };
  }

  async listCodes(eventSlug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    const codes = await this.prisma.inviteCode.findMany({
      where: { eventId: event.id },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        codeHash: true,
        revoked: true,
        usedAt: true,
        createdAt: true,
      },
    });

    return codes;
  }

  async revokeCode(id: number) {
    const code = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!code) {
      throw new NotFoundException(`Invite code ${id} not found`);
    }

    const updated = await this.prisma.inviteCode.update({
      where: { id },
      data: { revoked: true },
      select: {
        id: true,
        codeHash: true,
        revoked: true,
      },
    });

    return updated;
  }

  async joinWithCode(eventSlug: string, rawCode: string) {
    const code = rawCode?.trim();
    if (!code) {
      throw new BadRequestException('Invite code is required');
    }

    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
    });
    if (!event) {
      throw new NotFoundException(`Event "${eventSlug}" not found`);
    }

    const hash = this.hashCode(code);
    const inviteCode = await this.prisma.inviteCode.findUnique({
      where: { codeHash: hash },
    });

    if (!inviteCode || inviteCode.eventId !== event.id || inviteCode.revoked) {
      throw new ForbiddenException('Invalid or revoked invite code');
    }

    // Mark usedAt if not set yet
    if (!inviteCode.usedAt) {
      await this.prisma.inviteCode.update({
        where: { id: inviteCode.id },
        data: { usedAt: new Date() },
      });
    }

    // Create a ballot session in DB
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        ballotCodeHash: hash,
        eventId: event.id,
        expiresAt,
      },
    });

    return {
      sessionId,
      expiresAt,
      codeHash: hash,
      eventId: event.id,
    };
  }
}

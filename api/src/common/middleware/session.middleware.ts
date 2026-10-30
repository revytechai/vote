import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { BallotSessionData } from '../decorators/ballot-session.decorator';

const SESSION_COOKIE = 'rv_session';

const SESSION_INCLUDE = {
  user: { include: { roles: true, team: true } },
} as const satisfies Prisma.SessionInclude;

type SessionWithUser = Prisma.SessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

interface RequestWithSession extends Request {
  user?: AuthenticatedUser;
  ballotSession?: BallotSessionData;
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const sessionId = readSessionId(req);

    if (sessionId) {
      await this.applySession(sessionId, req, res);
    }

    next();
  }

  /**
   * Load the session and put the user and the ballot session on the request.
   * A database that is temporarily unavailable must not fail the request, so
   * every error ends up here as an anonymous request.
   */
  private async applySession(
    sessionId: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });

      if (!session) {
        return;
      }

      if (session.expiresAt > new Date()) {
        attachUser(req, session);
        attachBallotSession(req, session);
        return;
      }

      await this.expireSession(sessionId, res);
    } catch {
      // Ignore the failure and continue without a session.
    }
  }

  private async expireSession(sessionId: string, res: Response): Promise<void> {
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}

function readSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE] || undefined;
}

function attachUser(req: Request, session: SessionWithUser): void {
  const user = session.user;
  if (!user) {
    return;
  }

  (req as RequestWithSession).user = {
    id: user.id,
    handle: user.handle,
    email: user.email,
    roles: user.roles.map((role) => role.role),
    teamId: user.teamId,
    team: user.team ? { id: user.team.id, name: user.team.name } : null,
  };
}

function attachBallotSession(req: Request, session: SessionWithUser): void {
  if (!session.ballotCodeHash) {
    return;
  }

  (req as RequestWithSession).ballotSession = {
    sessionId: session.id,
    codeHash: session.ballotCodeHash,
    eventId: session.eventId,
  };
}

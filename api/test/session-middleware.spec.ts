import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { SessionMiddleware } from '../src/common/middleware/session.middleware';
import { PrismaService } from '../src/prisma/prisma.service';

interface SessionUser {
  id: number;
  handle: string;
  email: string;
  roles: Array<{ role: string }>;
  teamId: number | null;
  team: { id: number; name: string } | null;
}

interface SessionRow {
  id: string;
  expiresAt: Date;
  ballotCodeHash: string | null;
  eventId: number | null;
  user: SessionUser | null;
}

interface SessionRequest extends Request {
  user?: unknown;
  ballotSession?: unknown;
}

const USER: SessionUser = {
  id: 7,
  handle: 'participant',
  email: 'participant@example.com',
  roles: [{ role: 'participant' }, { role: 'viewer' }],
  teamId: 3,
  team: { id: 3, name: 'Team Three' },
};

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    expiresAt: new Date(Date.now() + 60_000),
    ballotCodeHash: null,
    eventId: null,
    user: USER,
    ...overrides,
  };
}

function createMiddleware(findUnique: unknown, remove: unknown) {
  const prisma = {
    session: { findUnique, delete: remove },
  } as unknown as PrismaService;

  return new SessionMiddleware(prisma);
}

function createRequest(cookies?: Record<string, string>): SessionRequest {
  return { cookies } as unknown as SessionRequest;
}

function createResponse() {
  return { clearCookie: vi.fn() } as unknown as Response & {
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('SessionMiddleware', () => {
  it('continues without touching the database when there is no session cookie', async () => {
    const findUnique = vi.fn();
    const remove = vi.fn();
    const middleware = createMiddleware(findUnique, remove);
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.ballotSession).toBeUndefined();
  });

  it('attaches the user, roles and team of a valid session', async () => {
    const findUnique = vi.fn().mockResolvedValue(sessionRow());
    const middleware = createMiddleware(findUnique, vi.fn());
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: 7,
      handle: 'participant',
      email: 'participant@example.com',
      roles: ['participant', 'viewer'],
      teamId: 3,
      team: { id: 3, name: 'Team Three' },
    });
  });

  it('attaches the ballot session when the session carries a code hash', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(sessionRow({ ballotCodeHash: 'hash-1', eventId: 42 }));
    const middleware = createMiddleware(findUnique, vi.fn());
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(req.ballotSession).toEqual({
      sessionId: 'session-1',
      codeHash: 'hash-1',
      eventId: 42,
    });
  });

  it('attaches a ballot session for a session without a user', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(sessionRow({ user: null, ballotCodeHash: 'hash-2' }));
    const middleware = createMiddleware(findUnique, vi.fn());
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(req.user).toBeUndefined();
    expect(req.ballotSession).toEqual({
      sessionId: 'session-1',
      codeHash: 'hash-2',
      eventId: null,
    });
  });

  it('leaves the request untouched when the session does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const remove = vi.fn();
    const middleware = createMiddleware(findUnique, remove);
    const req = createRequest({ rv_session: 'missing' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('deletes an expired session and clears the cookie', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(sessionRow({ expiresAt: new Date(Date.now() - 1000) }));
    const remove = vi.fn().mockResolvedValue({ id: 'session-1' });
    const middleware = createMiddleware(findUnique, remove);
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(remove).toHaveBeenCalledWith({ where: { id: 'session-1' } });
    expect(res.clearCookie).toHaveBeenCalledWith('rv_session', { path: '/' });
    expect(req.user).toBeUndefined();
    expect(req.ballotSession).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps the request alive when the expired session cannot be deleted', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue(sessionRow({ expiresAt: new Date(Date.now() - 1000) }));
    const remove = vi.fn().mockRejectedValue(new Error('database is gone'));
    const middleware = createMiddleware(findUnique, remove);
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('rv_session', { path: '/' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('continues without a session when the database lookup fails', async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error('database is down'));
    const middleware = createMiddleware(findUnique, vi.fn());
    const req = createRequest({ rv_session: 'session-1' });
    const res = createResponse();
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(req.ballotSession).toBeUndefined();
  });
});

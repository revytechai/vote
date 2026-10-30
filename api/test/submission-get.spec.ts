import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, TestContext } from './test-helper';

describe('GET /api/v1/submissions/:id (public)', () => {
  let ctx: TestContext;
  let approvedId: number;
  let pendingId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    const event = await ctx.prisma.event.create({
      data: { slug: 'sub-get', title: 'Sub Get', description: 'd' },
    });
    const team = await ctx.prisma.team.create({ data: { name: 'Team X' } });
    await ctx.prisma.user.create({
      data: { handle: 'alice', email: 'alice@example.com', teamId: team.id },
    });
    approvedId = (
      await ctx.prisma.submission.create({
        data: {
          eventId: event.id,
          title: 'Approved',
          summary: 's',
          status: 'approved',
          teamId: team.id,
          artifacts: { create: [{ kind: 'repo', url: 'https://example.com/r' }] },
        },
      })
    ).id;
    pendingId = (
      await ctx.prisma.submission.create({
        data: { eventId: event.id, title: 'Pending', summary: 's' },
      })
    ).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns an approved submission without login, no emails', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/submissions/${approvedId}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id: approvedId,
      title: 'Approved',
      status: 'approved',
      team: { name: 'Team X', members: ['alice'] },
      artifacts: [{ kind: 'repo', url: 'https://example.com/r' }],
    });
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  it('404s for a non-approved submission', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/submissions/${pendingId}`)
      .expect(404);
  });

  it('404s for a missing submission', async () => {
    await request(ctx.app.getHttpServer()).get('/api/v1/submissions/999999').expect(404);
  });
});

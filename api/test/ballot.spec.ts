import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, csrfHeaders, getCookie, TestContext } from './test-helper';
import { CodesService } from '../src/codes/codes.service';

describe('Ballot casting & replacement (one-per-code)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('allows one ballot per code per round, replaceable until round closes', async () => {
    // 1. Create event
    const event = await ctx.prisma.event.create({
      data: {
        slug: 'ballot-event',
        title: 'Ballot Event',
        description: 'Testing ballots',
      },
    });

    // 2. Create submissions
    const sub1 = await ctx.prisma.submission.create({
      data: {
        eventId: event.id,
        title: 'Project Alpha',
        summary: 'Alpha summary',
        status: 'approved',
      },
    });
    const sub2 = await ctx.prisma.submission.create({
      data: {
        eventId: event.id,
        title: 'Project Beta',
        summary: 'Beta summary',
        status: 'approved',
      },
    });

    // 3. Create open round
    const round = await ctx.prisma.round.create({
      data: {
        eventId: event.id,
        name: 'Round 1',
        method: 'star',
        status: 'open',
        maxScore: 5,
      },
    });

    // 4. Generate invite code
    const codesService = ctx.app.get(CodesService);
    const { codes } = await codesService.generateCodes(event.slug, 1);
    const plainCode = codes[0];

    // 5. Join event with code
    const joinRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/events/${event.slug}/join`)
      .set('Cookie', csrfHeaders().cookie)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ code: plainCode })
      .expect(204);

    const ballotSessionCookie = getCookie(joinRes, 'rv_session');

    // 6. Cast ballot
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/rounds/${round.id}/ballot`)
      .set('Cookie', `${ballotSessionCookie}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({
        scores: {
          [sub1.id]: 4,
          [sub2.id]: 2,
        },
      })
      .expect(204);

    // Verify ballot saved
    const getRes1 = await request(ctx.app.getHttpServer())
      .get(`/api/v1/rounds/${round.id}/ballot`)
      .set('Cookie', ballotSessionCookie)
      .expect(200);

    expect(getRes1.body.scores[sub1.id]).toBe(4);
    expect(getRes1.body.scores[sub2.id]).toBe(2);

    // Check DB has exactly 1 ballot for this round
    const countBefore = await ctx.prisma.ballot.count({
      where: { roundId: round.id },
    });
    expect(countBefore).toBe(1);

    // 7. Replace ballot (same code)
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/rounds/${round.id}/ballot`)
      .set('Cookie', `${ballotSessionCookie}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({
        scores: {
          [sub1.id]: 5,
          [sub2.id]: 0,
        },
      })
      .expect(204);

    // Check DB still has exactly 1 ballot
    const countAfter = await ctx.prisma.ballot.count({
      where: { roundId: round.id },
    });
    expect(countAfter).toBe(1);

    // Verify scores were replaced
    const getRes2 = await request(ctx.app.getHttpServer())
      .get(`/api/v1/rounds/${round.id}/ballot`)
      .set('Cookie', ballotSessionCookie)
      .expect(200);

    expect(getRes2.body.scores[sub1.id]).toBe(5);
    expect(getRes2.body.scores[sub2.id]).toBe(0);

    // 8. Close round
    await ctx.prisma.round.update({
      where: { id: round.id },
      data: { status: 'closed' },
    });

    // 9. Attempting to cast or replace ballot on closed round returns 409 Conflict
    const conflictRes = await request(ctx.app.getHttpServer())
      .put(`/api/v1/rounds/${round.id}/ballot`)
      .set('Cookie', `${ballotSessionCookie}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({
        scores: {
          [sub1.id]: 1,
        },
      })
      .expect(409);

    expect(conflictRes.body.message).toContain('Round is closed');
  });
});

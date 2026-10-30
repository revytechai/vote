import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, csrfHeaders, getCookie, TestContext } from './test-helper';
import { AuthService } from '../src/auth/auth.service';

describe('Results Visibility & Tally Calculation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('hides results (403) unless results_visible or closed; computes tally correctly', async () => {
    // 1. Setup event
    const event = await ctx.prisma.event.create({
      data: {
        slug: 'results-event',
        title: 'Results Test Event',
        description: 'Testing results',
      },
    });

    // 2. Setup manager
    const managerHandle = 'resmgr';
    await ctx.app.get(AuthService).register({
      handle: managerHandle,
      email: 'resmgr@example.com',
      password: 'Password123!',
      role: 'manager',
    });

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', csrfHeaders().cookie)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ login: managerHandle, password: 'Password123!' })
      .expect(204);

    const mgrSession = getCookie(loginRes, 'rv_session');

    // 3. Create approved submissions
    const sub1 = await ctx.prisma.submission.create({
      data: {
        eventId: event.id,
        title: 'Project A',
        summary: 'Summary A',
        status: 'approved',
      },
    });
    const sub2 = await ctx.prisma.submission.create({
      data: {
        eventId: event.id,
        title: 'Project B',
        summary: 'Summary B',
        status: 'approved',
      },
    });
    const sub3 = await ctx.prisma.submission.create({
      data: {
        eventId: event.id,
        title: 'Project C',
        summary: 'Summary C',
        status: 'approved',
      },
    });

    // 4. Create round: open, results_visible: false
    const round = await ctx.prisma.round.create({
      data: {
        eventId: event.id,
        name: 'STAR Round',
        method: 'star',
        status: 'open',
        resultsVisible: false,
        maxScore: 5,
      },
    });

    // 5. Query results when hidden -> 403 Forbidden
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/rounds/${round.id}/results`)
      .expect(403);

    // 6. Cast some ballots
    // Ballot 1: sub1: 5, sub2: 4, sub3: 1
    const b1 = await ctx.prisma.ballot.create({
      data: { roundId: round.id, codeHash: 'hash1' },
    });
    await ctx.prisma.ballotVote.createMany({
      data: [
        { ballotId: b1.id, submissionId: sub1.id, score: 5 },
        { ballotId: b1.id, submissionId: sub2.id, score: 4 },
        { ballotId: b1.id, submissionId: sub3.id, score: 1 },
      ],
    });

    // Ballot 2: sub1: 3, sub2: 5, sub3: 2
    const b2 = await ctx.prisma.ballot.create({
      data: { roundId: round.id, codeHash: 'hash2' },
    });
    await ctx.prisma.ballotVote.createMany({
      data: [
        { ballotId: b2.id, submissionId: sub1.id, score: 3 },
        { ballotId: b2.id, submissionId: sub2.id, score: 5 },
        { ballotId: b2.id, submissionId: sub3.id, score: 2 },
      ],
    });

    // 7. Make results visible: PATCH admin/rounds/:id
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/rounds/${round.id}`)
      .set('Cookie', `${mgrSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ results_visible: true })
      .expect(200);

    // 8. Query results now succeeds (200 OK)
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/rounds/${round.id}/results`)
      .expect(200);

    expect(res.body.round).toBe(round.id);
    expect(res.body.method).toBe('star');
    expect(res.body.ballots).toBe(2);
    expect(res.body.rows).toHaveLength(3);
    expect(res.body.runoff).toBeDefined();
    expect(res.body.final).toBe(false);

    // sub2 total = 4 + 5 = 9, sub1 total = 5 + 3 = 8, sub3 total = 1 + 2 = 3
    // Runoff between sub1 and sub2:
    // Ballot 1 prefers sub1 (5 vs 4)
    // Ballot 2 prefers sub2 (5 vs 3)
    // Tie in preferences (1 vs 1) -> tiebreak by total: sub2 has 9 vs sub1 8 -> sub2 wins!
    expect(res.body.runoff.winner).toBe(sub2.id);
    expect(res.body.rows[0].submission_id).toBe(sub2.id);
    expect(res.body.rows[0].rank).toBe(1);

    // 9. Now close the round and set results_visible = false to verify closed rounds still show results
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/rounds/${round.id}`)
      .set('Cookie', `${mgrSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ status: 'closed', results_visible: false })
      .expect(200);

    const closedRes = await request(ctx.app.getHttpServer())
      .get(`/api/v1/rounds/${round.id}/results`)
      .expect(200);

    expect(closedRes.body.final).toBe(true);
    expect(closedRes.body.rows).toHaveLength(3);

    // 10. Admin CSV export works
    const csvRes = await request(ctx.app.getHttpServer())
      .get(`/api/v1/admin/rounds/${round.id}/export.csv`)
      .set('Cookie', mgrSession)
      .expect(200);

    expect(csvRes.header['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('rank');
    expect(csvRes.text).toContain('submission_id');
    expect(csvRes.text).toContain('Project B');
  });
});

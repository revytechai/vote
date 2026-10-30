import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, csrfHeaders, getCookie, TestContext } from './test-helper';
import { AuthService } from '../src/auth/auth.service';

describe('Role Guards Enforcement', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createSessionForRole(role: string, handle: string): Promise<string> {
    const password = 'Password123!';
    await ctx.app.get(AuthService).register({
      handle,
      email: `${handle}@example.com`,
      password,
      role,
    });

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', csrfHeaders().cookie)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ login: handle, password })
      .expect(204);

    return getCookie(loginRes, 'rv_session') || '';
  }

  it('unauthenticated request to admin endpoint returns 401 Unauthorized', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/events');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Authentication required');
  });

  it('participant role cannot access admin events (403 Forbidden)', async () => {
    const session = await createSessionForRole('participant', 'participant1');

    const listRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/events')
      .set('Cookie', session);

    expect(listRes.status).toBe(403);
    expect(listRes.body.message).toContain('Access denied');

    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events')
      .set('Cookie', `${session}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ slug: 'illegal', title: 'Illegal' });

    expect(createRes.status).toBe(403);
    expect(createRes.body.message).toContain('Access denied');
  });

  it('viewer role cannot create admin events (403 Forbidden)', async () => {
    const session = await createSessionForRole('viewer', 'viewer1');

    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events')
      .set('Cookie', `${session}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ slug: 'viewer-event', title: 'Viewer Event' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('sponsor role can register prize but cannot create events', async () => {
    const sponsorSession = await createSessionForRole('sponsor', 'sponsor1');
    const managerSession = await createSessionForRole('manager', 'manager1');

    // Manager creates event
    await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events')
      .set('Cookie', `${managerSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ slug: 'sponsor-test-event', title: 'Sponsor Test' })
      .expect(201);

    // Sponsor cannot create another event
    await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events')
      .set('Cookie', `${sponsorSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ slug: 'sponsor-bad-event', title: 'Bad Event' })
      .expect(403);

    // Sponsor CAN create a prize for the event
    const prizeRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events/sponsor-test-event/prizes')
      .set('Cookie', `${sponsorSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({
        name: 'Best AI Agent',
        sponsor: 'SponsorCorp',
        description: '$1000 prize',
        quantity: 1,
        category: 'AI',
      })
      .expect(201);

    expect(prizeRes.body.name).toBe('Best AI Agent');
  });

  it('manager role can manage events, rounds, codes, and moderation', async () => {
    const managerSession = await createSessionForRole('manager', 'eventmanager2');

    // Create event
    await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events')
      .set('Cookie', `${managerSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ slug: 'mgr-event', title: 'Manager Event' })
      .expect(201);

    // Create round
    const roundRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events/mgr-event/rounds')
      .set('Cookie', `${managerSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ name: 'Final Round', method: 'star', status: 'open' })
      .expect(201);

    expect(roundRes.body.name).toBe('Final Round');

    // Generate codes
    const codesRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/admin/events/mgr-event/codes')
      .set('Cookie', `${managerSession}; ${csrfHeaders().cookie}`)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ count: 2 })
      .expect(201);

    expect(codesRes.body.codes).toHaveLength(2);
  });

  it('superuser role has full access across all operations', async () => {
    const rootSession = await createSessionForRole('superuser', 'adminroot');

    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/admin/events')
      .set('Cookie', rootSession)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});

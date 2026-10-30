import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, csrfHeaders, TestContext } from './test-helper';

describe('POST /api/v1/auth/register ignores client-supplied role', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  it('always registers as participant', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', csrfHeaders().cookie)
      .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
      .send({ handle: 'mallory', email: 'm@example.com', password: 'Password123!', role: 'superuser' })
      .expect(201);
    expect(res.body.roles).toEqual(['participant']);
  });
});

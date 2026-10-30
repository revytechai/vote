import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, TestContext } from './test-helper';

describe('GET /api/health', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns 200 {"status":"ok"} outside the /api/v1 prefix', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('is public and requires no CSRF or session cookies', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/health')
      .set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not touch or write to the database', async () => {
    // Spy on prisma service methods to ensure no DB interaction
    const userCreateSpy = vi.spyOn(ctx.prisma.user, 'create');
    const sessionFindSpy = vi.spyOn(ctx.prisma.session, 'findUnique');

    const res = await request(ctx.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);

    expect(userCreateSpy).not.toHaveBeenCalled();
    expect(sessionFindSpy).not.toHaveBeenCalled();
  });

  it('does not respond at /api/v1/health or /api/v1/api/health', async () => {
    const res1 = await request(ctx.app.getHttpServer()).get('/api/v1/health');
    expect(res1.status).toBe(404);

    const res2 = await request(ctx.app.getHttpServer()).get('/api/v1/api/health');
    expect(res2.status).toBe(404);
  });
});

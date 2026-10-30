import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, csrfHeaders, getCookie, TestContext } from './test-helper';
import { AuthService } from '../src/auth/auth.service';

describe('Auth, Lockout, and CSRF Protection', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('Argon2 Password Hashing', () => {
    it('hashes passwords with argon2id and verifies correctly', async () => {
      const password = 'SuperSecretPassword!';
      const authService = ctx.app.get(AuthService);
      const hash = await authService.hashPassword(password);

      expect(hash).toMatch(/^\$argon2id\$/);

      const isMatch = await authService.verifyPassword(hash, password);
      expect(isMatch).toBe(true);

      const isWrong = await authService.verifyPassword(hash, 'wrong');
      expect(isWrong).toBe(false);
    });
  });

  describe('Account Lockout (5 failures for 15 min)', () => {
    it('locks account after 5 failed attempts with 429 status', async () => {
      const handle = 'lockoutuser';
      const email = 'lockout@example.com';
      const password = 'CorrectPassword123';

      // Register user
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ handle, email, password })
        .expect(201);

      // 4 failed login attempts -> 401 Unauthorized
      for (let i = 1; i <= 4; i++) {
        const res = await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Cookie', csrfHeaders().cookie)
          .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
          .send({ login: handle, password: 'WrongPassword' })
          .expect(401);
        expect(res.body.message).toContain('Invalid credentials');
      }

      // Check DB user failedLoginAttempts
      const dbUser = await ctx.prisma.user.findUnique({ where: { handle } });
      expect(dbUser?.failedLoginAttempts).toBe(4);
      expect(dbUser?.lockoutUntil).toBeNull();

      // 5th failed attempt -> 429 Too Many Requests
      const fifthRes = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ login: handle, password: 'WrongPassword' })
        .expect(429);

      expect(fifthRes.body.message).toContain('Account locked out');

      // Check DB user is locked out
      const lockedUser = await ctx.prisma.user.findUnique({ where: { handle } });
      expect(lockedUser?.failedLoginAttempts).toBe(5);
      expect(lockedUser?.lockoutUntil).not.toBeNull();
      expect(new Date(lockedUser!.lockoutUntil!).getTime()).toBeGreaterThan(Date.now());

      // Even correct password gets 429 while locked out
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ login: handle, password: password })
        .expect(429);
    });
  });

  describe('CSRF Double-Submit Protection', () => {
    it('rejects unsafe POST requests when CSRF token is missing or mismatched', async () => {
      // 1. Missing both cookie and header
      const missingBoth = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ handle: 'badcsrf1', email: 'csrf1@example.com' });

      expect(missingBoth.status).toBe(403);
      expect(missingBoth.body.message).toContain('CSRF token missing');

      // 2. Missing header
      const missingHeader = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', 'rv_csrf=token123')
        .send({ handle: 'badcsrf2', email: 'csrf2@example.com' });

      expect(missingHeader.status).toBe(403);
      expect(missingHeader.body.message).toContain('CSRF token missing');

      // 3. Missing cookie
      const missingCookie = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-CSRF-Token', 'token123')
        .send({ handle: 'badcsrf3', email: 'csrf3@example.com' });

      expect(missingCookie.status).toBe(403);
      expect(missingCookie.body.message).toContain('CSRF token mismatch');

      // 4. Mismatched token
      const mismatched = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', 'rv_csrf=tokenAAA')
        .set('X-CSRF-Token', 'tokenBBB')
        .send({ handle: 'badcsrf4', email: 'csrf4@example.com' });

      expect(mismatched.status).toBe(403);
      expect(mismatched.body.message).toContain('CSRF token mismatch');

      // 5. Matching tokens succeeds
      const accepted = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', 'rv_csrf=validToken123')
        .set('X-CSRF-Token', 'validToken123')
        .send({ handle: 'goodcsrf', email: 'good@example.com', password: 'Pass' });

      expect(accepted.status).toBe(201);
      expect(accepted.body.handle).toBe('goodcsrf');
    });

    it('sets rv_csrf cookie on safe GET requests', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/events')
        .expect(200);

      const csrfCookie = getCookie(res, 'rv_csrf');
      expect(csrfCookie).toBeDefined();
    });
  });

  describe('Privacy: Email never returned publicly', () => {
    it('/auth/me returns handle and roles but never email', async () => {
      const handle = 'privateuser';
      const email = 'secret@example.com';
      const password = 'SecretPassword123';

      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ handle, email, password })
        .expect(201);

      const loginRes = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ login: handle, password })
        .expect(204);

      const sessionCookie = getCookie(loginRes, 'rv_session');

      const meRes = await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(meRes.body.handle).toBe(handle);
      expect(meRes.body.roles).toContain('participant');
      expect(meRes.body.email).toBeUndefined();
    });
  });
});

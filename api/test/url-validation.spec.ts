import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateHttpsUrl } from '../src/common/validators/url.validator';
import { createTestApp, csrfHeaders, getCookie, TestContext } from './test-helper';

describe('URL Validation & Submission Artifacts', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('validateHttpsUrl unit tests', () => {
    it('accepts valid https URLs', () => {
      expect(validateHttpsUrl('https://example.com')).toBe(true);
      expect(validateHttpsUrl('https://github.com/revytechai/repo')).toBe(true);
      expect(validateHttpsUrl('https://sub.domain.co.uk/path?q=1#frag')).toBe(true);
    });

    it('rejects non-https URLs', () => {
      expect(validateHttpsUrl('http://insecure.example.com')).toBe(false);
      expect(validateHttpsUrl('ftp://ftp.example.com/file.zip')).toBe(false);
      expect(validateHttpsUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects javascript: and data: URIs', () => {
      expect(validateHttpsUrl('javascript:alert(1)')).toBe(false);
      expect(validateHttpsUrl('javascript://example.com/%0Aalert(1)')).toBe(false);
      expect(validateHttpsUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(validateHttpsUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    });

    it('rejects invalid or empty strings', () => {
      expect(validateHttpsUrl('')).toBe(false);
      expect(validateHttpsUrl('not-a-url')).toBe(false);
      expect(validateHttpsUrl('//example.com')).toBe(false);
    });
  });

  describe('Submission creation artifact URL enforcement', () => {
    it('rejects submission with http or javascript artifact link', async () => {
      // 1. Create event
      const event = await ctx.prisma.event.create({
        data: {
          slug: 'hackathon-2026',
          title: 'Hackathon 2026',
          description: 'Test Event',
        },
      });

      // 2. Register participant
      const regRes = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({
          handle: 'testcoder',
          email: 'coder@example.com',
          password: 'Password123!',
        })
        .expect(201);

      // 3. Login to get session
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', csrfHeaders().cookie)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({ login: 'testcoder', password: 'Password123!' })
        .expect(204);

      const sessionCookie = getCookie(loginRes, 'rv_session');

      // 4. Attempt submission with javascript: URI
      const badRes = await request(ctx.app.getHttpServer())
        .post(`/api/v1/events/${event.slug}/submissions`)
        .set('Cookie', `${sessionCookie}; ${csrfHeaders().cookie}`)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({
          title: 'Malicious Submission',
          summary: 'Testing xss',
          artifacts: [
            { kind: 'demo', url: 'javascript:alert(1)' },
          ],
        })
        .expect(400);

      expect(badRes.body.message).toContain('https:');

      // 5. Attempt submission with http: URL
      const httpRes = await request(ctx.app.getHttpServer())
        .post(`/api/v1/events/${event.slug}/submissions`)
        .set('Cookie', `${sessionCookie}; ${csrfHeaders().cookie}`)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({
          title: 'Insecure Submission',
          summary: 'Testing http',
          artifacts: [
            { kind: 'repo', url: 'http://github.com/insecure/repo' },
          ],
        })
        .expect(400);

      expect(httpRes.body.message).toContain('https:');

      // 6. Valid submission with https: URL succeeds
      const goodRes = await request(ctx.app.getHttpServer())
        .post(`/api/v1/events/${event.slug}/submissions`)
        .set('Cookie', `${sessionCookie}; ${csrfHeaders().cookie}`)
        .set('X-CSRF-Token', csrfHeaders()['x-csrf-token'])
        .send({
          title: 'Awesome App',
          summary: 'A great app',
          artifacts: [
            { kind: 'repo', url: 'https://github.com/valid/repo', label: 'GitHub' },
            { kind: 'demo', url: 'https://demo.example.com', label: 'Live Demo' },
          ],
        })
        .expect(201);

      expect(goodRes.body.id).toBeDefined();
      expect(goodRes.body.status).toBe('pending');
      expect(goodRes.body.artifacts).toHaveLength(2);
    });
  });
});

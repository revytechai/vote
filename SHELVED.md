# SHELVED: vote

**Status:** shelved on 2026-10-31 by Mark's order. No further development or deployment until the un-shelve criteria below are met.

## State at shelving
- Tip commit: `abcb16e` ("Initial TypeScript vote app: NestJS+Prisma API, tally, Angular web (#1661)"). This is the remote `main` at the time of shelving. An earlier note referenced `e07f29b` (#1663/#1664, web-only), but that commit is not on `main`, and it has not been reviewed.
- Layout: `api/` (NestJS + Prisma), `packages/tally`, `web/` (Angular + Tailwind), `docs/`, GitHub Actions CI.
- The initial import landed on a degraded review receipt. A full 5-voice review is owed (see `REVIEW-DEBT.md`).

## What works (per static source review; nothing was run live)
- Angular + TypeScript + Tailwind web view; BSD-3-Clause © REVYTECH.
- Prisma ORM (no string-built SQL); argon2id password hashing; HttpOnly session cookie with SameSite=Lax.
- DB unique constraints on (round, code) and (ballot, submission); server-side round close; health endpoint.
- `--check-config`, `doctor`, SIGHUP reload that keeps the old config when the new one is bad; strict JSON config; secrets in env.
- Public register drops `role` at the controller (`api/src/auth/auth.controller.ts:27-28`), with an HTTP test (`api/test/register-role.spec.ts`).
- No XSS sink found (Angular auto-sanitising; no `innerHTML` or `bypassSecurityTrust*`).

## Decisions
- **Backend language:** TypeScript backend approved by Mark, overriding guideline rule 9 (Go). Record in `web/CONFORMANCE.md`.
- **Routing:** `/` must be the REVYTECH login page; public results live at `/results`.

## Claimed fix: "public register accepted role superuser". PARTIAL, FAIL
- Controller strip: api/src/auth/auth.controller.ts:27-28 drops `role` before calling the service. This is OK.
- **Critical / High, privilege assignment (mass-assignment sink left in place):** api/src/auth/auth.service.ts:18 and :83-85. `RegisterDto.role` still exists, and `AuthService.register` still honours any of the values superuser, manager, sponsor, viewer or participant. The only defence is one controller line, so any future caller (admin create, OIDC provisioning, seeding, a refactor) inherits the bypass. Fix pattern: remove `role` from RegisterDto, hard-code `participant` in the service, and grant staff roles only through a separate admin-only `grantRole` method guarded by RolesGuard and audited. Add a service-level unit test as well as the HTTP test.
- Red-green: the test api/test/register-role.spec.ts:5-18 exists and asserts `['participant']` over HTTP. The history has no red evidence, because the repo is one squashed commit with the test and the fix together, so rule 15 can't be verified.
- Other role paths: there is no update-profile endpoint and no admin user-create endpoint (grep finds no other `UserRole` writes). Team addMember only writes `teamId`. As of this commit, no other path sets a role. Note: admin seeding and creating the first superuser are not implemented, and there is no first-login wizard.

## Security findings
1. **High, broken access control (fail-open default):** api/src/app.module.ts:46-55 registers only ThrottlerGuard and CsrfGuard as global guards, and `SessionGuard` (common/guards/session.guard.ts) is never registered. `@Public()` therefore has no effect, and every non-admin route depends on a hand-written `if (!user)` check (submissions.controller.ts:30, teams.controller.ts:21/33, events.controller.ts:75). Fix pattern: register SessionGuard as an APP_GUARD so routes are deny-by-default, and add a test that enumerates every route without a session and expects 401 unless the route is `@Public`.
2. **High, ballot integrity / invite revocation:** rounds.service.ts:182-209 and codes.service.ts:109-132. Revoking a code doesn't invalidate ballot sessions that already exist, which last 7 days. castBallot never re-checks `inviteCode.revoked`. Fix pattern: in castBallot, join the session to InviteCode and reject revoked codes, or delete sessions when a code is revoked. Add a red test.
3. **Medium, ballot integrity / input validation:** rounds.service.ts:212-260. Submission IDs on the ballot aren't checked against the round's event or `approved` status, and the delete-then-create isn't in a transaction. A partial failure can leave the ballot empty, and concurrent PUTs can interleave. Fix pattern: validate the IDs against the event's approved submissions, and wrap the upsert, deleteMany and createMany in `prisma.$transaction`.
4. **Medium, invite codes:** codes.service.ts:15 and :32. Codes are 64-bit, stored as an unsalted SHA-256 and looked up by hash. The entropy is acceptable for a rate-limited join, but the codes don't expire and multi-use is unbounded, since `usedAt` (lines 113-119) is informational only and the code is redeemable on any number of devices. Fix pattern: use 128 bits or a keyed HMAC with a server pepper, and add `expiresAt` plus a policy of single active session per code.
5. **Medium, admin sessions:** auth.service.ts:187-196. There is a fixed 7-day absolute lifetime with no idle timeout, sessions aren't rotated or revoked on password change, and admin sessions get the same TTL as participants. Lockout (lines 151-171) is per-account, which enables a lockout DoS against admins, and the error message confirms the account exists. Fix pattern: a short idle and absolute TTL for staff, generic errors, and per-IP plus per-account backoff instead of a hard lock.
6. **Medium, CSRF:** csrf.guard.ts:45 compares tokens with `!==`, which is not constant-time. The double-submit cookie isn't bound to the session or signed, and there is no Origin/Referer check. Login and join are CSRF-protected but issue a fresh session, which leaves login CSRF possible. Fix pattern: an HMAC-signed token bound to the session, `timingSafeEqual`, and an Origin allow-list on unsafe methods. Mitigating factor: SameSite=Lax.
7. **Medium, rate limits:** app.module.ts:30-35. The global limit is 100/min, register (auth.controller.ts:22) has no stricter limit, and the vote PUT and submission create have none. With `trust proxy` set to 1 (main.ts:44-48), the per-IP limit is only correct behind exactly one proxy. Fix pattern: per-route limits on register, vote and submit, per-identity keys (session or code hash), and a documented proxy hop count.
8. **Medium, register:** auth.service.ts:70-73. The password is optional with no policy, so passwordless accounts can be registered (login then refuses them). The email check is just `includes('@')`. Fix pattern: a class-validator or zod DTO with a minimum length and a breached-password check. Also, there is no global ValidationPipe anywhere (grep), so the DTOs are plain interfaces and every input is unvalidated. Add `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})`, which also closes the mass-assignment class in general.
9. **Low/Medium, link validation:** common/validators/url.validator.ts:9-23. Https-only via the URL API is good. There is no length cap and no host allow-list, and line 28 echoes the raw input in the error message (reflection). The web view uses `rel="noopener"` without `noreferrer` (web/src/app/pages/submission-detail-page.ts:43). The server doesn't fetch previews, so SSRF is N/A. Fix pattern: a cap of about 2048 characters, an optional host allow-list, no echo, and `rel="noopener noreferrer"`.
10. **Medium, XSS/CSP/headers:** no helmet, CSP, HSTS, X-Content-Type-Options or frame-ancestors anywhere in api or web (grep). Angular interpolation and `[href]` are auto-sanitised, and there is no `innerHTML` or `bypassSecurityTrust*`, so I found no XSS sink. Fix pattern: helmet with a strict CSP (no unsafe-inline), at the proxy or app level, plus a test asserting the headers.
11. **Low, team membership:** teams.service.ts:51-71. Any team member can move any user, by handle, into their team without that user's consent, including pulling them out of another team. Fix pattern: an invite/accept flow, and refuse when the target already has a team unless staff.
12. **Low, info leak:** roles.guard.ts:43 lists the required roles in the 403 message. Fix pattern: use a generic message.

## Guidelines conformance (main + restructure/tool-neutral-skills)
- OPEN QUESTION (not a FAIL), backend language: the backend is NestJS/TypeScript, while rule 9 says Go. This is pending Mark. REVIEW-DEBT.md records it as Mark's decision; the exception still has to go into web/CONFORMANCE.md.
- **FAIL, rule 12/29 login at `/`:** web/src/app/app.routes.ts:4 redirects `/` to `e/hackathon-2026`. There is no login page or route at all, so none of the REVYTECH login UX (eye toggle, remember-username, first-login wizard) exists. Results live at `e/:slug/results` (line 21), not `/results` as decided. Fix: `/` becomes the REVYTECH login page and `/results` the public results route.
- FAIL, rule 15 red-green: one squashed commit, so there is no red-before-green evidence.
- FAIL, coverage: api/vitest.config.ts has no coverage provider or threshold, and CI doesn't enforce 100% on the auth, vote, invite and config paths.
- FAIL, Playwright E2E: there is no Playwright config, tests or `artifacts/playwright/`.
- FAIL, CI: .github/workflows/ci.yml runs on ubuntu-latest (GitHub Actions), with no Jenkinsfile and no FreeBSD target. It also deviates from the cloudbsd-ports → Jenkins → InternalPkg pipeline.
- FAIL, FreeBSD ops: no rc.d script, pidfile handling or mdoc man page. REVIEW-DEBT.md admits this. PASS: `--check-config`, `doctor`, SIGHUP reload keeping the old config when the new one is bad (evidence in docs/evidence/), strict JSON config, secrets in env.
- FAIL, i18n: there are no i18n catalogs (admitted in REVIEW-DEBT.md).
- FAIL, strict CSP and HTTPS-only: see security finding 10. `cookie_secure` defaults to env-driven rather than secure-by-default.
- UNVERIFIED, dual-stack (rule 32): the bind host comes from config. A and AAAA records can't be checked without live testing, which is held.
- PASS: Angular + TypeScript + Tailwind view, BSD-3-Clause © REVYTECH (rule 27), Prisma ORM (no string-built SQL), argon2id hashing, HttpOnly session cookie with SameSite=Lax, DB unique constraints on (round, code) and (ballot, submission), server-side round close, health endpoint.
- Not reviewed: Tailwind breakpoints, the WCAG check, REVYTECH colour tokens in web/src/styles.css (the #1664 cyberpunk skin is newer than this commit), gitleaks, npm audit.

## Owed review
A full 5-voice review of the tip is owed; see `REVIEW-DEBT.md`.

## Required before un-shelving
1. Superuser fix completed in the service: remove `role` from `RegisterDto`, hard-code `participant` in `AuthService.register`, and grant staff roles only through an admin-only, audited path. Add service-level red-green tests.
2. Global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})` and `SessionGuard` registered as `APP_GUARD` (deny-by-default), with a route-enumeration test.
3. Invite-code revocation ends existing ballot sessions; castBallot re-checks revocation.
4. CSP (strict, no unsafe-inline) and HSTS, plus the other security headers, with a test asserting them.
5. Playwright E2E suite with artifacts.
6. Coverage gate in CI (100% on auth, vote, invite and config paths).
7. Jenkins on FreeBSD CI via cloudbsd-ports → Jenkins → InternalPkg, replacing ubuntu-latest Actions.
8. rc.d service script and mdoc man page.
9. `/` is the REVYTECH login page; public results at `/results`.
10. The owed full review completed and recorded in `REVIEW-DEBT.md`.

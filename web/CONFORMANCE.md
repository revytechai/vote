# CONFORMANCE — cloudbsdorg/application_guidelines (main @38207c8 + restructure/tool-neutral-skills)

| # | Guideline | Status |
|---|-----------|--------|
| 1 | Angular + TypeScript view, no domain logic beyond the STAR display tally | fixed |
| 2 | Tailwind for layout/breakpoints, REVYTECH tokens only (navy #001a33/#002a55/#013a73, blue #0066cc/#004a99, cyan #00d4ff, light #f8fafc, Outfit/Inter) | OPEN: plain CSS now; brief2 is queued |
| 3 | Desktop + mobile, no horizontal scroll | fixed (Playwright 390x844 + 1280x800, all 8 pages pass) |
| 4 | Login at `/` (REVYTECH chrome, username-or-email, eye icon inside the password field, remember username) | OPEN: `/` redirects to the event page; brief2 is queued |
| 5 | Public results + prizes at `/results` | OPEN: currently at /e/:slug/results and /e/:slug/prizes |
| 6 | i18n: external strings, required locale list, English first, endonyms; RTL wraps words only (public-site-i18n-rtl-wrap) | OPEN: strings are hardcoded; brief2 is queued |
| 7 | CSRF protection | fixed: rv_csrf → X-CSRF-Token interceptor, pluggable provider |
| 8 | Strict CSP, HTTPS only, IPv4+IPv6 | OPEN: belongs to the nginx deploy on the pkg001.eu jail |
| 9 | Playwright evidence including the login and login-UX suite | partial: 16/16 page checks pass; the login suite waits on #4 |
| 10 | SVG mockups in the repo | OPEN |
| 11 | agy UI polish | OPEN (optional, does not block) |
| 12 | Factory admin/admin + first-login wizard | EXCEPTION (security-driven, per Chief of Staff ruling 2026-10-30): there is no admin/admin default and no first-login wizard. The first admin is created by the CLI seed `vote admin create`, which writes a generated password to a file with mode 0600. |

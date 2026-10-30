# API field names (what the NestJS API actually returns)

Wire format is **snake_case** for model fields; auth/session helpers use camelCase where noted. Base path `/api/v1`. Source of truth: `api/openapi.yaml`.

| Object | Fields |
|---|---|
| Event | `slug, title, description, proposals_open, registration_open, starts_at, ends_at` (ISO or null). No numeric `id` is exposed; address events by `slug`. |
| Round | `id, event` (slug), `name, category` (nullable), `method` (`star`\|`score`\|`approval`), `status` (`draft`\|`open`\|`closed`), `results_visible, max_score` |
| Idea | `id, title, proposer, description, link, vote_points, pres_no` |
| Team | `{ id, name, members: string[] }` (members are handles only) |
| TeamRef (in /auth/me, register) | `{ id, name }` or `null` |
| Submission | `id, title, summary, idea_id, status, team` (Team or null), `artifacts` |
| Artifact | `kind` (`repo`\|`pr`\|`demo`\|`slides`\|`other`), `url` (https only), `label` (optional) |
| Prize | `id, name, sponsor, description, quantity, category, eligibility, round_id, awards: [{submission_id, title, team}]` |
| Me (`GET /auth/me`) | `id, handle, roles[], team` |
| CSRF (`GET /auth/csrf`) | `{ csrfToken }`, echo as header `X-CSRF-Token` |
| Register body | `handle, email, password?, teamName?` (camelCase; `role` is ignored) |
| Login body | `login` (handle or email), `password` |
| Create team body | `name` |
| Error | NestJS default `{ statusCode, message, error }` |

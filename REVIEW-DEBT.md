# Review debt

- 2026-10-30: the initial import (api/, packages/tally, web/, docs, CI) was committed on a DEGRADED review-and-record receipt by Mark's explicit instruction ("then screw the review right now"). The DGX `default` review voice was unreachable and `minimax` was rate-limited. Scanners (gitleaks, semgrep, trivy, sonar) ran. A full 5-voice review of this commit is owed.
- Known open items: guidelines say backends should be Go (Languages/LANGUAGES.md); this backend is TypeScript by Mark's decision; record the exception in CONFORMANCE.md. i18n error codes, rc.d script and man page are not done yet.

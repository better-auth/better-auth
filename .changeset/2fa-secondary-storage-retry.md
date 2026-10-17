---
"better-auth": patch
---

Retry secondary-only `2fa-*` verification reads (find and consume) a few times on a secondary-storage miss instead of failing immediately with `INVALID_TWO_FACTOR_COOKIE`.

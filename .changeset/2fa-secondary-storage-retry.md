---
"better-auth": patch
---

Retry secondary-only `2fa-*` verification reads (find and consume) on a secondary-storage miss instead of failing immediately with `INVALID_TWO_FACTOR_COOKIE`. Find retries up to 3 times (~500ms worst case), consume up to twice per key (~200ms). A permanent miss still fails closed; stores that lag longer than a moment should set `verification.storeInDatabase: true`.

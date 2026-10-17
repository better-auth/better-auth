---
"better-auth": patch
---

Retry secondary-only `2fa-*` verification reads (find and consume) on a secondary-storage miss instead of failing immediately with `INVALID_TWO_FACTOR_COOKIE`. Find retries up to 3 times (~500ms of sleep worst case, plus the re-reads themselves), retry consume up to twice per key (three attempts total, ~200ms of sleep per key, ~400ms worst case across the hashed + plain key pair). A permanent miss still fails closed; stores that lag longer than a moment should set `verification.storeInDatabase: true`.

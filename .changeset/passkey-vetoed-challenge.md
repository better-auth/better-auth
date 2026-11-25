---
"@better-auth/passkey": patch
---

Passkey registration and authentication options are no longer returned when a `verification.create.before` database hook returns `false` for the challenge record. Both endpoints now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500) instead of returning a challenge that verification would reject.

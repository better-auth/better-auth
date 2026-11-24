---
"@better-auth/electron": patch
---

Electron no longer returns an authorization code when a `verification.create.before` database hook returns `false` for its record. The sign-in transfer and `/electron/transfer-user` now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500) instead of returning a code that `/electron/token` would reject.

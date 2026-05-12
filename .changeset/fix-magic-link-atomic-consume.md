---
"better-auth": patch
---

Fix race condition in the `magic-link` plugin's verify handler that allowed two concurrent requests to mint two sessions from the same single-use token. The handler now consumes the verification row atomically via `internalAdapter.consumeVerificationValue`, so a given magic link mints at most one session regardless of concurrency. The `allowedAttempts` option is retained for backward compatibility but no longer multiplies successful redemptions; tokens are single-use. The second-redeem error code changes from `ATTEMPTS_EXCEEDED` to `INVALID_TOKEN` (the token no longer exists after consumption).

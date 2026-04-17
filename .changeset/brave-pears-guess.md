---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/kysely-adapter": patch
---

Harden the paused sign-in attempt against cross-user takeover, concurrent completion, and unbounded verification.

- Atomic completion. The `InternalAdapter` gains `consumeSignInAttempt(id)`, a single primitive that reads and deletes the attempt in one step and returns the row only when the delete actually removed exactly one record. Two-factor verify now finalizes the session off that returned row, so two requests racing against the same `attemptId` can no longer both issue a session.
- Cross-user rejection. When the caller already has a session, `/two-factor/*` verifies that the session's user matches the attempt's user before consuming. Presenting another user's `attemptId` rejects with `INVALID_TWO_FACTOR_COOKIE` instead of processing the code against the victim's secret.
- Expiry closed at consume time. Expiry is re-checked inside the load/consume path rather than up front, removing the window where a just-expired attempt could still be used.
- Per-attempt rate limit. A new `maxVerificationAttempts` option on the two-factor plugin (default `5`, per NIST SP 800-63B-4 §5.2.2) locks the attempt once exceeded. Subsequent verifications (including one with a valid code) return `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` until a fresh sign-in issues a new attempt. Backed by two new columns on `signInAttempt`: `failedVerifications: number` (required, default `0`) and `lockedAt: Date | null`. Regenerate and apply your adapter migrations.
- Startup cost removed. `createSignInAttempt` no longer performs an unbounded `DELETE WHERE expiresAt < now()` on each insert. Expired rows are reaped on demand by the load/consume path.
- `@better-auth/kysely-adapter` ships a corrected `node:sqlite` dialect: writes now use `StatementSync.run()` and report `changes` as `numAffectedRows`, so Kysely's `numDeletedRows` / `numUpdatedRows` are accurate. The atomic consume relies on this; any adapter-level code that branched on affected-row counts under SQLite was previously always seeing `0`.

Public surface additions:

- `InternalAdapter.consumeSignInAttempt(id)`
- `InternalAdapter.recordSignInAttemptFailure(id, { maxAttempts })`
- `TwoFactorOptions.maxVerificationAttempts`
- `SignInAttempt.failedVerifications`, `SignInAttempt.lockedAt`

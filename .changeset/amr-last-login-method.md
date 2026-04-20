---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/api-key": minor
---

Record authentication factors on the session and project them into OIDC `id_token`. Collapse the `last-login-method` plugin to a reader over the new session field.

Every sign-in path (password, OTP, magic-link, passkey, SIWE, OAuth, one-tap, phone-number, 2FA verification) now writes an `AuthenticationMethodReference[]` to `session.amr`. The record captures the factor chain (`method`, `factor`, `completedAt`) per OIDC Core §2 and RFC 8176, and replaces the ad-hoc `loginMethod` / `lastLoginMethod` fields that previously lived on sign-in attempts and social accounts.

The `oidc-provider` plugin projects `session.amr[].method` into the `id_token.amr` claim through the RFC 8176 registry at token-issue time (so `password` becomes `pwd`, all OTP-style methods become `otp`, `passkey` becomes `hwk`, etc.), advertises `amr` in `claims_supported`, and lists the projected vocabulary as `amr_values_supported` in discovery. OAuth provider ids fall through as `"fed"`.

New public surface:

- `@better-auth/core` exports `AuthenticationMethodReference`, `BUILTIN_AMR_METHOD` (shared vocabulary of built-in method names, including `API_KEY: "api-key"` for proof-of-possession key material), `amrForProvider(providerId)` (canonical AMR shape for OAuth-style sign-ins), `amrSchema` / `amrEntrySchema` (Zod validators with ISO-string revival), `toRfc8176Amr(method, { provider? })` (maps `api-key` to `"pop"`), and `RFC_8176_AMR_VALUES`. OAuth callers must use `amrForProvider` instead of building the entry inline; passkeys stay `possession` pending attestation-aware upgrades.
- `Session.amr: AuthenticationMethodReference[]` is a required, server-assigned column (`input: false`) backed by `amrSchema`, so values stored as JSON in secondary storage round-trip with `completedAt` as a `Date`. Regenerate and apply your adapter migrations.

Breaking changes:

- `AMR_METHOD` is renamed to `BUILTIN_AMR_METHOD`; a new `BUILTIN_AMR_METHOD.EMAIL_VERIFICATION` is added so `verifyEmail`-driven sessions no longer claim `magic-link`.
- The `lastLoginMethod` plugin no longer accepts `storeInDatabase`, `customResolveMethod`, or `schema`. The TypeScript types now mark these as `never` so callers get a compile-time error; passing any of them at runtime throws at init. The plugin now reads `session.amr[0].method` and stamps the `better-auth.last_used_login_method` cookie from that value. The stored value now reflects the factor used (`password`), not the endpoint called (`email`); callers that compared against the old string should migrate to the factor vocabulary.
- `oidc-provider` discovery metadata gains a required `amr_values_supported` field; custom `OIDCMetadata` overrides should set or accept it.
- `verifyTwoFactor` returns a discriminated union (`{ mode: "finalize", ... } | { mode: "session", ... }`) instead of a collapsed shape. Callers that destructure `valid` must switch on `mode`: finalize-mode `valid(ctx, factor)` finalizes the paused sign-in and appends the second factor to `session.amr`; session-mode `valid(ctx)` returns the existing session with no AMR mutation.
- `signInSocial` native ID-token sign-ins now stamp `session.amr` with `amrForProvider(provider.id)` (factor `possession`) instead of the previous `password`/`knowledge` shape that misrepresented the federation.
- The `api-key` plugin's synthetic session (returned when an API key verifies) now carries `amr: [{ method: "api-key", factor: "possession", ... }]`. Consumers that read `session.amr` will see a single-entry chain and token issuers project the method to RFC 8176 `"pop"`.
- `changePassword` now reissues `session.amr[0].completedAt` to the moment of the rotation (preserving any 2FA entries in `amr[1..]`); freshness checks against the primary factor will see the new timestamp.
- `internalAdapter.recordSignInAttemptFailure` now uses an atomic compare-and-swap on `failedVerifications` with a bounded retry, so concurrent failed verifications cannot race past the lockout threshold. On CAS exhaustion the adapter emits `logger.warn` instead of silently returning null.
- `internalAdapter.casUpdateVerificationValue(identifier, expectedValue, newValue)` is a new primitive for atomic read-modify-write on a verification record's `value` column. The 2FA OTP plugin uses it to bump its per-OTP bad-code counter so concurrent submissions cannot collapse increments and undercount toward the OTP-scoped lockout.
- Two-factor verify flow fixes:
  - Backup-code verification now routes invalid codes through the shared `resolver.invalid` path, so a wrong backup code on a paused sign-in advances the attempt's `failedVerifications` and eventually trips `lockedAt` at the configured `maxVerificationAttempts` (previously bypassed the attempt-level rate limiter).
  - `trustDevice: true` is now honored in session mode (step-up / enrollment on an already-authenticated session); it previously only fired in finalize mode and was silently dropped for signed-in callers.
  - TOTP/OTP enrollment no longer passes the active `Session` row as `createSession` overrides; the new session is minted cleanly and the previous session is revoked as before.
- `InternalAdapter.updateSignInAttempt` is removed. The paused-attempt record is consumed atomically via `consumeSignInAttempt`; per-factor state is carried on `session.amr` instead.
- `SignInAttempt.loginMethod` is replaced by `SignInAttempt.amr: AuthenticationMethodReference[]`. The `user.lastLoginMethod` column that `lastLoginMethod({ storeInDatabase: true })` used to write is gone: the cookie is the only projection. Regenerate and apply your adapter migrations.

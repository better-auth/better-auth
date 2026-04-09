---
"better-auth": minor
---

feat(two-factor)!: add OTP-only enablement and remove `skipVerificationOnEnable`

`enableTwoFactor` now accepts a `method` parameter (`"otp" | "totp"`, default `"totp"`) so users can enable 2FA with email/SMS-based OTP codes without going through the TOTP authenticator app setup.

### New: `method: "otp"`

- Sets `twoFactorEnabled: true` immediately (no verification step needed).
- Creates a `twoFactor` row with backup codes but no TOTP secret.
- Returns `{ backupCodes }`.
- Requires `otpOptions.sendOTP` to be configured on the server — rejects with `OTP_NOT_CONFIGURED` otherwise.

### Default: `method: "totp"`

- Existing behavior unchanged. Returns `{ totpURI, backupCodes }`.
- Rejects with `TOTP_NOT_CONFIGURED` if `totpOptions.disable` is set.

### Breaking changes

- **Removed `skipVerificationOnEnable`** — use `method: "otp"` for immediate activation, or the standard TOTP verification flow. The `verified` column (added in the previous release) makes this option redundant.
- **Schema change:** `twoFactor.secret` is now nullable. OTP-only users have `secret: null`. Requires a database migration (`npx @better-auth/cli migrate`).

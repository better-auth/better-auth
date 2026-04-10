---
"better-auth": minor
---

feat(two-factor)!: add OTP-only enablement and remove `skipVerificationOnEnable`

`enableTwoFactor` now accepts a `method` parameter (`"otp" | "totp"`, default `"totp"`) and returns a discriminated response with a `method` field.

### `method: "otp"`

- Sets `twoFactorEnabled: true` immediately.
- Returns `{ method: "otp" }`.
- Requires `otpOptions.sendOTP` to be configured on the server; rejects with `OTP_NOT_CONFIGURED` otherwise.

### `method: "totp"` (default)

- Returns `{ method: "totp", totpURI, backupCodes }`.
- Rejects with `TOTP_NOT_CONFIGURED` if `totpOptions.disable` is set.

### Breaking changes

- **Removed `skipVerificationOnEnable`**: use `method: "otp"` for immediate activation, or the standard TOTP verification flow.
- **Response shape changed**: `enableTwoFactor` includes a `method` field in the response (`"otp"` or `"totp"`).

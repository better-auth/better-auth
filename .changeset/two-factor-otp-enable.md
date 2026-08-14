---
"better-auth": minor
---

feat(two-factor)!: add OTP-only enablement and a discriminated response

`enableTwoFactor` now accepts a `method` parameter (`"otp" | "totp"`, default `"totp"`) and returns a discriminated response with a `method` field.

### `method: "otp"`

- Sets `twoFactorEnabled: true` immediately.
- Returns `{ method: "otp" }`.
- Requires `otpOptions.sendOTP` to be configured on the server; rejects with `OTP_NOT_CONFIGURED` otherwise.

### `method: "totp"` (default)

- Returns `{ method: "totp", totpURI, backupCodes }`.
- Rejects with `TOTP_NOT_CONFIGURED` if `totpOptions.disable` is set.

The existing `skipVerificationOnEnable` option remains supported for TOTP enrollment.

### Breaking changes

- **Response shape changed**: `enableTwoFactor` includes a `method` field in the response (`"otp"` or `"totp"`).

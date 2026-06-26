---
"better-auth": patch
---

Add account-level lockout for two-factor verification. The attempt limit applies per account across sign-in challenges and across factors: TOTP, email-OTP, and backup codes share one counter, and a successful verification resets it.

Enabled by default: an account locks for 15 minutes after 10 consecutive failed verifications, and locked attempts return `429` with the `ACCOUNT_TEMPORARILY_LOCKED` error code. Configure it with `twoFactor({ accountLockout: { enabled, maxFailedAttempts, durationSeconds } })`.

Run a database migration after upgrading: this adds `failedVerificationCount` and `lockedUntil` columns to the `twoFactor` table.

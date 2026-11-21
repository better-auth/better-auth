---
"better-auth": patch
---

The two-factor plugin adds `auth.api.verifyTwoFactorCode`, a server-only function that checks a user's TOTP code or backup code without the two-factor cookie, for headless sign-in flows. Call it after you verify the user's first factor. It creates no session and sets no cookie. Its failures count toward the same account lockout as the cookie-based verifiers, and it consumes a backup code on success.

---
"better-auth": patch
---

Add a `storeOTP` option to the phone number plugin, matching the option already available on email OTP, two-factor and magic link. OTPs can now be stored `hashed` or `encrypted` (or transformed by a custom hasher or encryptor) instead of in plain text, and verification now uses a constant-time comparison. Defaults to `plain`, so existing behavior is unchanged.

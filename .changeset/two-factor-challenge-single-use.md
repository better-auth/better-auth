---
"better-auth": patch
---

Two-factor sign-in challenges are now single-use and expiry-checked. An expired challenge can no longer complete login when paired with a valid TOTP, OTP, or backup code, and two concurrent verifications of the same challenge can no longer each create a session.

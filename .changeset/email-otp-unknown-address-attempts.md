---
"better-auth": patch
---

Email OTP code checks now lock out after `allowedAttempts` wrong codes for an unregistered address too, so the responses no longer reveal whether an account exists.

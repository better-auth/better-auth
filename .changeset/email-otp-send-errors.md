---
"better-auth": patch
---

The email OTP endpoints reported `success: true` even when `sendVerificationOTP` threw, so a failed email (rate limit, provider outage, misconfiguration) looked like a successful send to the client. Errors thrown by `sendVerificationOTP` now surface to the caller with their original status and body, matching the default `sendVerificationEmail` behavior.

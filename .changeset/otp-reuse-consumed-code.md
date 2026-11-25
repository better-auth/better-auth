---
"better-auth": patch
---

With `resendStrategy: "reuse"`, an email OTP resend no longer repeats a code that was used or removed before the resend could extend its expiry. It sends a new code instead.

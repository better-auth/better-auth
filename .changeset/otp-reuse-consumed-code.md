---
"better-auth": patch
---

With `resendStrategy: "reuse"`, an email OTP resend no longer repeats a code that was used or removed while the resend was running. It sends a new code instead, so the delivered code can always be verified.

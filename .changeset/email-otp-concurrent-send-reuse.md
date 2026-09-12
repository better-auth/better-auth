---
"better-auth": patch
---

When two requests asked for an email OTP for the same address at the same time on a database with a unique `verification.identifier`, the second request replaced the first request's code, so the code in the first email was rejected as invalid. A request that loses the insert now delivers the code the other request just stored when that code can be read back (`storeOTP` `plain`, `encrypted`, or a custom `decrypt`), and sends nothing when it cannot (`storeOTP` `hashed`), leaving the delivery to the request that stored it. A pending row is replaced only when it is expired, out of attempts, holds a code that cannot be read back on an ordinary resend, or was read by the same request under `resendStrategy: "rotate"` (the default), and only that exact row, so a code a concurrent request just stored is never removed.

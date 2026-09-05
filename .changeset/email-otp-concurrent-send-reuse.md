---
"better-auth": patch
---

When two requests asked for an email OTP for the same address at the same time on a database with a unique `verification.identifier`, the second request replaced the first request's code, so the code in the first email was rejected as invalid. A request that loses the insert now delivers the code the other request just stored whenever that code can still be used, and replaces only the exact row it had seen itself when that row is expired, out of attempts, or stored hashed, so a concurrent request's code is never removed.

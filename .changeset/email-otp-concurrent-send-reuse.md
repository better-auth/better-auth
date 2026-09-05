---
"better-auth": patch
---

When two requests asked for an email OTP for the same address at the same time on a database with a unique `verification.identifier`, the second request replaced the first request's code, so the code in the first email was rejected as invalid. The second request now delivers the same code as the first one whenever that code can still be used, and only issues a new code when the existing one is expired, out of attempts, or stored hashed.

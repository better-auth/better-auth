---
"better-auth": patch
---

When two email OTP requests for the same address collide on a database with a unique `verification.identifier`, both emails now carry the same code when it can be read back. Before, the code in one of the emails was rejected as invalid.

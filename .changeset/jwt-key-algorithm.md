---
"better-auth": patch
---

The JWT plugin now verifies JWTs and session cookie-cache JWTs with the algorithm of the stored key instead of the one named in the token header, and logs a warning when it signs or verifies a JWT without an issuer or audience.

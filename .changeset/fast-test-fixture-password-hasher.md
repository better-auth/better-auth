---
"better-auth": patch
---

The shared test fixture from `better-auth/test` now hashes passwords with a fast salted SHA-256 by default instead of production scrypt, so suites that build many test instances finish sooner. Pass `emailAndPassword.password` to `getTestInstance` to keep your own hasher.

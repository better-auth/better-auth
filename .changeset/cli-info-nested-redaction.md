---
"auth": patch
---

`auth info` now redacts values nested under sensitive keys (such as SSO private keys and JWKs), key passphrases, and sensitive keys written in snake_case or kebab-case.

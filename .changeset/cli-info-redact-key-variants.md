---
"auth": patch
---

`auth info` now redacts secrets written in snake_case, kebab-case or uppercase (such as `api_key`), plural names like `authTokens`, private key passphrases, and values nested under a secret such as a private key JWK.

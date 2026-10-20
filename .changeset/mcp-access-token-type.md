---
"@better-auth/mcp": patch
---

`requireMcpAuth` now accepts only OAuth access tokens and rejects session JWTs from the JWT plugin, even when they share the issuer and audience.

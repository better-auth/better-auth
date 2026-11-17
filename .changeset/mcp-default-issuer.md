---
"@better-auth/mcp": minor
---

`requireMcpAuth` without an `issuer` option now expects the OAuth provider's issuer, which follows a custom `jwt.issuer`. Before, it expected the base URL, so with a custom `jwt.issuer` it rejected every token unless you passed `issuer`. The default also accepts the issuer as configured, which tokens issued by earlier versions carry, and an `issuer` you pass is still the only value accepted.

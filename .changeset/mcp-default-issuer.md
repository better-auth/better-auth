---
"@better-auth/mcp": minor
---

`requireMcpAuth` without an `issuer` option now expects the OAuth provider's issuer, which follows a custom `jwt.issuer`. Before, it expected the base URL, so with a custom `jwt.issuer` it rejected every token unless you passed `issuer`. When it reads this server's records or keys in-process, the default also accepts the issuer as configured, which tokens issued by earlier versions carry. When it checks a signature against keys fetched from a URL (`jwksUrl`, or the JWT plugin's `jwks.remoteUrl` with no OAuth provider in the same process), it expects the discovery issuer alone, as RFC 9068 requires an exact match. An `issuer` you pass is still the only value accepted.

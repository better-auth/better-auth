---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

`oauthProviderResourceClient` now defaults `verifyOptions.typ` to `at+jwt` when it checks a JWT's signature, and `requireMcpAuth` requires it when you set `jwksUrl`, so both reject other JWTs with `401 invalid_token` (RFC 9068 §4). Before, a JWT signed with the same keys, such as a session JWT, passed when its signature, `iss`, and `aud` matched.

**Breaking:** a JWT without `typ: at+jwt` that passed signature verification now fails. Pass `verifyOptions.typ` to the resource client to accept another issuer's value.

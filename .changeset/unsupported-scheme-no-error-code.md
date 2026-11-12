---
"@better-auth/core": minor
---

`verifyAccessTokenRequest` now rejects an `Authorization` header that has no scheme, or a scheme other than `Bearer` or `DPoP` such as `Basic`, without an `error` code, the same as a request with no `Authorization` header (RFC 6750 §3.1).

- **Breaking:** the thrown 401 no longer has `error: "invalid_token"` or `error_description` in its `body`. Code that matched `body.error === "invalid_token"` to catch this case should check for a 401 without `body.error` instead.
- `createResourceServerChallenge` and the MCP handler now answer such a request with a `Bearer` challenge that keeps its `resource_metadata` link. Previously it got a `DPoP` challenge with `error="invalid_token"` and no `resource_metadata`.

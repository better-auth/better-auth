---
"@better-auth/oauth-provider": patch
---

Clients exchanging an authorization code with PKCE now get the token errors RFC 7636 and RFC 6749 specify. A `code_verifier` that does not match the authorization request's `code_challenge` returns HTTP 400 `invalid_grant`; it previously returned HTTP 401 `invalid_request`. For clients where PKCE is optional, a missing or unexpected `code_verifier` still returns `invalid_request`, now with HTTP 400 instead of 401. No request that failed before now succeeds.

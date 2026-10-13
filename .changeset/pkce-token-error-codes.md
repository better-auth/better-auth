---
"@better-auth/oauth-provider": patch
---

The token endpoint now answers a `code_verifier` that does not match the authorization request's `code_challenge` with HTTP 400 `invalid_grant`, as RFC 7636 requires. It previously returned HTTP 401 `invalid_request`. A missing or unexpected `code_verifier` still returns `invalid_request`, now with HTTP 400 instead of 401.

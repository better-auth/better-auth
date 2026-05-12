---
"@better-auth/oauth-provider": patch
"better-auth": patch
---

Fix race condition in the OAuth authorization-code grant: two concurrent token-exchange requests sharing the same `code` could both pass the find step before either delete completed and each mint an independent access/refresh/id token set. The `authorization_code` handler in `@better-auth/oauth-provider`, plus the legacy `oidc-provider` and `mcp` plugins in `better-auth`, now consume the verification row atomically via `internalAdapter.consumeVerificationValue`. The first caller mints tokens; concurrent racers receive `invalid_grant` (RFC 6749 §5.2). Malformed-verification-value branches in `@better-auth/oauth-provider` previously returned a project-specific `invalid_verification` code; those are now `invalid_grant` so spec-compliant clients can branch on the standard code.

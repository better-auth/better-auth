---
"@better-auth/oauth-provider": patch
---

Return `invalid_client` from the token endpoint for an unknown `client_id` on every grant type, resolving the client before the grant lookup as required by RFC 6749 §5.2.

---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): emit RFC 6749 / RFC 7591 errors for framework-level input validation failures

Previously, malformed requests that failed Zod validation (unknown
`grant_type`, unknown `response_type`, invalid `redirect_uris` on
registration, etc.) returned Better Auth's generic
`{"message":"…","code":"VALIDATION_ERROR"}` envelope, which is not a
valid OAuth 2.1 error response. The handler-level OAuth errors already
followed the spec (#8103); this change extends the same alignment to the
framework-level validation layer.

Covered endpoints and envelopes:

- `/oauth2/token` → RFC 6749 §5.2 (`invalid_request`, `unsupported_grant_type`, `invalid_scope`)
- `/oauth2/authorize` → RFC 6749 §4.1.2.1 (302 redirect with error query params)
- `/oauth2/revoke` → RFC 7009 §2.2
- `/oauth2/introspect` → RFC 7662 §2.3
- `/oauth2/register` → RFC 7591 §3.2.2 (`invalid_redirect_uri`, `invalid_client_metadata`)

All translated responses include `Cache-Control: no-store` per OAuth 2.1,
and handler-level errors (already in RFC format) pass through unchanged.
Closes #9250.

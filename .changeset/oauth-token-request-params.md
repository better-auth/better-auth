---
"@better-auth/oauth-provider": minor
---

The `/oauth2/token`, `/oauth2/introspect`, and `/oauth2/revoke` endpoints now reject form parameters sent more than once. A request such as `code=a&code=b` at the token endpoint, for any grant type, or `token=a&token=b` at introspection returns `400 invalid_request` ("code must not be repeated"). Before, these endpoints used the last value, so the token endpoint could issue tokens and introspection or revocation acted on a token other than the first one sent. At the token endpoint, `resource` and `audience` may still repeat. An empty value counts as omitted. Clients that send each parameter once are unaffected.

A malformed `resource` at the token endpoint, such as one with a fragment or a relative URI, now returns `invalid_target` instead of `invalid_request`. If your client matches on the error code for these requests, update it. An empty `resource` is now treated as omitted, as RFC 6749 §3.2 requires; before, `resource=` returned `invalid_request`.

Token, introspection, registration, and end-session requests rejected by schema validation, such as a missing `grant_type`, now carry `Cache-Control: no-store`, like every other response from those endpoints.

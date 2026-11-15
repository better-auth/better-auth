---
"@better-auth/oauth-provider": patch
---

`/oauth2/introspect` now returns the client ID as the `sub` of a `client_credentials` token issued to a client with `subject_type: "pairwise"`. Before, it returned a pairwise hash of the client ID, which matched neither the token's own `sub` nor `client_id`.

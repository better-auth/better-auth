---
"@better-auth/oauth-provider": patch
---

With `allowPublicClientPrelogin` enabled, `POST /oauth2/public-client-prelogin` now returns a client only when its `client_id` matches the one in the signed `oauth_query`. Before, any valid signed query returned the public fields of any client. A request for a different client now gets a `401` with `invalid_client`. The built-in client plugin and sign-in pages that pass the `client_id` from the current authorization request are unaffected.

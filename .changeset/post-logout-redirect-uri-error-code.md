---
"@better-auth/oauth-provider": patch
---

Client registration and client updates that reject a `post_logout_redirect_uris` entry, because it uses `http` outside the allowed hosts or contains credentials, now return the `invalid_redirect_uri` error code instead of `invalid_client_metadata`. Rejected `redirect_uris` entries already returned `invalid_redirect_uri`, and so did malformed `post_logout_redirect_uris` values sent to `/oauth2/register`.

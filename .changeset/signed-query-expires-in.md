---
"@better-auth/oauth-provider": patch
---

Decouple the signed authorize query lifetime from the authorization code lifetime. `signParams` signed the login, create, consent, select-account, and post-login redirects with `codeExpiresIn`, so a short code TTL also expired the signed query a browser still had to complete, and the resume failed with `invalid_signature`. The new `signedQueryExpiresIn` option sets that lifetime independently and defaults to `codeExpiresIn`, so existing configurations are unchanged.

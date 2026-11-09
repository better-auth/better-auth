---
"@better-auth/oauth-provider": patch
---

A client secret without the configured `prefix.clientSecret` is now rejected like any other wrong secret: `client_secret_basic` gets 401 with a `WWW-Authenticate: Basic` challenge and `client_secret_post` gets 400.

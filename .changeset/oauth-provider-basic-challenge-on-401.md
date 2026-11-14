---
"@better-auth/oauth-provider": patch
---

Introspection and revocation requests with no client credentials, and `private_key_jwt` client assertions with an invalid signature, now get a `WWW-Authenticate: Basic` challenge with their `401 invalid_client` response. Browser clients on another origin can read it through `Access-Control-Expose-Headers`. Before, these 401 responses had no challenge. Status codes and error bodies don't change.

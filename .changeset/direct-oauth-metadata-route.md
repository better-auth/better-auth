---
"@better-auth/oauth-provider": patch
---

Serve OAuth authorization server and OpenID Connect metadata at the direct issuer well-known URLs for path-prefixed issuers. Direct metadata requests now honor `advanced.skipTrailingSlashes` and only handle `GET` and `HEAD`.

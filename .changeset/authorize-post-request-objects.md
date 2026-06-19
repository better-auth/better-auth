---
"@better-auth/oauth-provider": patch
---

Adds form-encoded POST support to the OIDC authorization endpoint and explicitly rejects unsupported OpenID Connect request objects with standard `request_not_supported` and `request_uri_not_supported` errors.

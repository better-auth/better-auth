---
"@better-auth/oauth-provider": patch
---

The OpenAPI schema for the `/oauth2/consent` and `/oauth2/continue` endpoints now documents the response body the endpoints actually return (`redirect` and `url`). It previously advertised a required `redirect_uri` field that never appeared in the response, so clients generated from or validated against the spec read a field that was always missing.

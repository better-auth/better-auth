---
"@better-auth/oauth-provider": patch
---

`POST /oauth2/client/rotate-keys` now refuses a client it cannot rotate, such as one that publishes a `jwks_uri` or a trusted client configured in code, before it fetches the client's keys or uses up the client assertion.

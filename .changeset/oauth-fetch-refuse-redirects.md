---
"@better-auth/core": patch
---

Refuse HTTP redirects on server-side OAuth requests

Better Auth refuses HTTP redirects on the server-side OAuth requests it makes during sign-in: the token exchange, token refresh, token introspection, and JWKS requests. A provider endpoint cannot redirect one of these requests to an unintended internal address. Conformant OAuth providers answer these endpoints with a direct response and never redirect, so standard integrations are unaffected.

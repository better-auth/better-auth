---
"@better-auth/passkey": patch
---

Include `user` in the `/passkey/verify-authentication` JSON response so the body matches the endpoint's declared OpenAPI schema and the client-side `{ session, user }` return type.

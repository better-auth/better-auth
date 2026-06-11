---
"better-auth": patch
---

Stateless OAuth deployments can now read account info, access tokens, and refresh tokens after different server instances handle sign-in and later requests. Session refresh also keeps the OAuth account cookie instead of clearing it in that case.

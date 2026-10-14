---
"better-auth": patch
---

Export `OAUTH_CALLBACK_ERROR_CODES` and the `OAuthCallbackErrorCode` type from `better-auth/oauth2`. Apps with their own OAuth error page can now type-check that they handle every code Better Auth redirects with.

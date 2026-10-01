---
"better-auth": patch
---

Export `OAUTH_CALLBACK_ERROR_CODES` and the `OAuthCallbackErrorCode` type from `better-auth/oauth2`, so apps that show their own OAuth error page can type-check that they handle every error code Better Auth redirects with.

---
"better-auth": minor
"@better-auth/core": minor
---

OAuth sign-in, account linking, callback, and proxy flows now build `redirect_uri` from the current request base URL when `baseURL.allowedHosts` is configured. Built-in social providers and generic OAuth providers now use the resolved request host for redirects in multi-host deployments.

Custom `OAuthProvider` implementations can omit `callbackPath` when using the shared `/callback/<provider-id>` route. Set `callbackPath` only for custom callback routes.

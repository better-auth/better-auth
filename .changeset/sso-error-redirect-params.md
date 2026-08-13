---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/sso": patch
"@better-auth/oauth-provider": patch
---

Error-page redirects merge their query parameters instead of concatenating them, and `onAPIError.errorUrlBuilder` can return the final URL so apps are not forced to use the `error` key.

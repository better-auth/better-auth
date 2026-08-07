---
"@better-auth/oauth-provider": patch
---

Export `verifyOAuthQueryParams` from the package root, so an application that renders its own consent page can verify the `sig`/`exp` this plugin's `signParams` puts on the authorization query before it renders anything.

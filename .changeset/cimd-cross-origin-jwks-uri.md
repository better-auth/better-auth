---
"@better-auth/cimd": patch
"@better-auth/oauth-provider": patch
---

Add the `isCrossOriginJwksUriAllowed` option to `cimd()` so you can accept a Client ID Metadata Document client whose `jwks_uri` is on a different origin than its `client_id`, without adding that origin to `trustedOrigins`. Such a `jwks_uri` is still rejected by default, and the option is consulted only for that case: at registration, when the document is refreshed, when an administrator updates the client, and before each client assertion.

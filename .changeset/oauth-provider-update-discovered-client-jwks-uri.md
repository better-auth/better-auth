---
"@better-auth/oauth-provider": patch
---

An administrator can now update a discovered client that publishes its keys at a `jwks_uri`, such as setting its `client_credentials_scopes` through `adminUpdateOAuthClient`. Before, the update failed with `jwks_uri must belong to a trusted origin or the Client ID Metadata Document origin` when the `jwks_uri` was on the client's `client_id` origin or on an origin that `isCrossOriginJwksUriAllowed` allows.

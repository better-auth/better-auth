---
"@better-auth/oauth-provider": patch
---

Fix `oauthProviderClient` requests without a body failing with a 415 error on pages with a signed OAuth query. The `oauth_query` body it adds is now sent as `application/json`.

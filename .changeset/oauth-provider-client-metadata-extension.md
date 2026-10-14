---
"@better-auth/oauth-provider": minor
---

Plugins that extend `oauthProvider()` with `extendOAuthProvider()` can now define their own client registration fields with `clientMetadata`. A client with invalid values for those fields is rejected with `invalid_client_metadata` when it registers through `/oauth2/register` or an admin creates or updates it, instead of when it first uses them.

Dynamic registration now accepts the fields an extension declares as top-level request fields and stores them in the client's `metadata`. It still ignores all other unrecognized fields. Setups without such an extension behave as before.

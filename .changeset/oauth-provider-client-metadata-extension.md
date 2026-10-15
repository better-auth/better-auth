---
"@better-auth/oauth-provider": minor
---

Plugins that extend `oauthProvider()` with `extendOAuthProvider()` can now define their own client registration fields with `clientMetadata`. A client with invalid values for those fields is rejected with `invalid_client_metadata` when it registers through `/oauth2/register` or a metadata document, or when an admin creates or updates it, instead of when it first uses them.

Dynamic registration now accepts the fields an extension declares as top-level request fields and stores them in the client's `metadata`. It still ignores all other unrecognized fields. Registration in setups without such an extension is unchanged.

Updating a client with an empty `metadata` object now clears its stored metadata. Previously the update left the old metadata in place.

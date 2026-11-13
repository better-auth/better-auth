---
"@better-auth/oauth-provider": minor
---

Revoking a refresh token at `/oauth2/revoke` now deletes every opaque access token of its grant, including those issued before earlier refreshes. Previously only the access tokens issued alongside that exact refresh token were deleted, so a token from before the last refresh stayed active until it expired. Opaque access tokens issued before you upgrade are still deleted only with the refresh token that issued them.

This release adds optional `grantId` columns to the `oauthRefreshToken` and `oauthAccessToken` tables, which every `oauthProvider()` setup needs. Apply them before deploying: run `npx auth@latest migrate` with the built-in Kysely adapter, or run `npx auth@latest generate` and apply the schema with your ORM.

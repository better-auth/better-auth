---
"@better-auth/oauth-provider": minor
---

Client secret expiry now takes effect. If you set `clientRegistrationClientSecretExpiration`, or pass `client_secret_expires_at` to `adminCreateOAuthClient` or `adminUpdateOAuthClient`, the expiry is now saved on the client and returned as `client_secret_expires_at` when the client is registered or read. Once it passes, the token, introspection, and revocation endpoints reject the secret with `invalid_client`. Previously the value was discarded, every response reported `client_secret_expires_at: 0`, and the secret never expired.

Clients created before you upgrade have no stored expiry, so their secrets still never expire. To give one an expiry, set `client_secret_expires_at` with `adminUpdateOAuthClient`; `0` removes it. A string value is read as a time span from now, such as `"90d"`, and a string that is not a time span is rejected with `invalid_client_metadata`. Rotating a secret keeps the client's current expiry.

This adds an optional `expiresAt` column to the `oauthClient` table. With the built-in Kysely adapter, run `npx auth@latest migrate`. With Prisma or Drizzle, run `npx auth@latest generate` and apply the change with your migration tool. MongoDB needs no migration. Until the column exists, creating or updating a client with an expiry fails, and so does every dynamic registration when `clientRegistrationClientSecretExpiration` is set. If you use neither, nothing changes, but run the migration so your schema stays in sync.

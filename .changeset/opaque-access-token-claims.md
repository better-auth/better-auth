---
"@better-auth/oauth-provider": minor
---

Introspecting an opaque access token now returns the `accessTokenClaims` a grant passed to `issueTokens`. Before, only JWT access tokens carried them, and opaque-token introspection dropped them. The provider stores them on the token row with its own claim names, such as `sub` and `client_id`, removed, and merges them back with the same precedence a JWT uses. Only clients allowed to introspect the token receive them.

**Behavior change:** a custom grant that passed `accessTokenClaims` while issuing opaque tokens will now see those claims at introspection, at `provider.validateAccessToken`, and in token exchange subject-token checks such as `may_act`. The stored claims stay in the database until the token row is deleted, so keep personal data out of them when the resource server can look it up instead.

**Migration required:** opaque access tokens store these claims in a new optional `accessTokenClaims` column on `oauthAccessToken`. Run `npx auth@latest migrate` or `npx auth@latest generate` before upgrading. With the Kysely, Prisma, or Drizzle adapter, the default schema check fails every request until the migration runs.

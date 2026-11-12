---
"@better-auth/oauth-provider": minor
---

JWT access tokens can now be revoked at `/oauth2/revoke` when you set `revocableJwtAccessTokens: true`. A revoked token is reported inactive by introspection and `validateAccessToken`, and UserInfo rejects it, until the token expires. Resource servers that verify tokens locally against the JWKS don't see the revocation and must introspect to honor it. The option is off by default because each of those checks adds a verification-store lookup, and it needs no database migration.

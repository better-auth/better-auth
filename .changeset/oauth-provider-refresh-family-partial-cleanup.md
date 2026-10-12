---
"@better-auth/oauth-provider": patch
---

When the OAuth provider detects refresh-token reuse, at the token endpoint or through `/oauth2/revoke`, it now marks the refresh-token family revoked before deleting it. If a database error stops the cleanup partway, the newest refresh token in the family can no longer be redeemed, and introspection and `/oauth2/userinfo` report its opaque access token inactive.

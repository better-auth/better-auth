---
"@better-auth/oauth-provider": minor
---

The new `onTokenRevoked` option is called after the provider revokes tokens, so you can tell resource servers that verify JWT access tokens locally, or keep an audit log, without matching verification-store identifiers.

It reports a client's revocation of an access or refresh token at `/oauth2/revoke`, and the grant revocation that follows reuse of a refresh token or an authorization code. Each event carries the token's `jti` or the revoked `grantId`, the client, why it happened, and when the revoked access tokens expire. It is not called when nothing was revoked, and an error it throws is logged without changing the response.

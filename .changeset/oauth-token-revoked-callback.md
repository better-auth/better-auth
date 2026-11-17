---
"@better-auth/oauth-provider": minor
---

The new `onTokenRevoked` option reports a grant or an access token the provider revokes, one event per revocation request, so you can tell resource servers that verify JWT access tokens locally, or keep an audit log, without matching verification-store identifiers.

It reports a client's revocation at `/oauth2/revoke` and the grant revocation that follows reuse of a refresh token or an authorization code. Each event carries the revoked `grantId` or the access token's `jti`, the client, why it happened, and the time after which you can drop your record of the revocation. It does not report an ended session, a disabled or deleted client, a deleted resource, or a deleted consent. Delivery is best effort: an error the callback throws is logged without changing the response.

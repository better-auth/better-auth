---
"@better-auth/oauth-provider": minor
---

The new `onTokenRevoked` option reports a grant or an access token the provider revokes, one event per revocation request, so you can tell resource servers that verify JWT access tokens locally, or keep an audit log, without matching verification-store identifiers.

It reports a client's revocation at `/oauth2/revoke` and the grant revocation that follows reuse of a refresh token or an authorization code. Each event identifies the revoked grant when a `grantId` exists, or the access token's `jti` when present, along with the client and why it happened. Keep your revocation record until the affected tokens expire; shortening `accessTokenExpiresIn` can require retaining it longer. It does not report an ended session, a disabled or deleted client, a deleted resource, or a deleted consent. Delivery is best effort: an error the callback throws is logged without changing the response.

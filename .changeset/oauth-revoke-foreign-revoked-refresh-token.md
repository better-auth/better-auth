---
"@better-auth/oauth-provider": patch
---

Revoking another client's already revoked refresh token no longer deletes the presenting client's own refresh tokens and the opaque access tokens they issued. The revoked-token check ran before the ownership check, so a client that presented a token it did not own could end its own grants for that user. The request now gets the same empty success response as it already did for another client's token that was not revoked, instead of a `400 invalid_request`.

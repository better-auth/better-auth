---
"@better-auth/oauth-provider": patch
---

Revoking another client's already revoked refresh token no longer deletes the presenting client's own refresh tokens and the opaque access tokens they issued. The revoked-token check ran before the ownership check, so a client that presented a token it did not own was treated as replaying its own token and ended its own grants for that user. The response is unchanged: the request still gets a `400 invalid_request`.

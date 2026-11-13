---
"@better-auth/oauth-provider": minor
---

Public clients can now use token exchange when you opt in with `oauthTokenExchange({ publicClients: "dpop-bound" })`. Such a client can exchange only a DPoP-bound access token issued to itself, must send a DPoP proof from that token's key, and gets a token bound to the same key. It cannot send an `actor_token`. Without the option, public clients still get `invalid_client`.

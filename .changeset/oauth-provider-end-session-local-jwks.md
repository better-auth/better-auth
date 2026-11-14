---
"@better-auth/oauth-provider": patch
---

The end-session endpoint now verifies `id_token_hint` with the signing keys of the auth instance instead of requesting its own `/jwks` endpoint, so RP-initiated logout works on runtimes that block requests to their own hostname.

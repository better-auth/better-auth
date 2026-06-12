---
"better-auth": patch
---

The OIDC provider's RP-initiated logout endpoint (`/oauth2/endsession`) no longer logs a user out, or revokes their OAuth tokens, in response to a cross-site GET that carries only a session cookie. Logout authenticated by a valid `id_token_hint` is unaffected.

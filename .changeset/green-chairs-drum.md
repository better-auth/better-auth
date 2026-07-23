---
"better-auth": minor
"@better-auth/core": minor
---

Generic OAuth users can now sign out from the configured OpenID provider when they call `authClient.signOut()`. When a provider exposes a discovered or configured logout endpoint, Better Auth redirects to it and includes the stored `id_token_hint` when available. Pass `callbackURL` or configure `postLogoutRedirectURI` for the return flow, with optional `state`, or set `disableRedirect` to handle the returned `url` yourself. When multiple linked providers support logout, Better Auth selects the most recently updated account. Set `disableProviderLogout: true` to keep sign-out local.

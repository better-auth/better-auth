---
"@better-auth/core": minor
"better-auth": minor
---

Custom token endpoint authentication hooks now receive `endpoint`, which is `"token"` for token requests and `"pushed_authorization_request"` for pushed authorization requests, so a hook can authenticate each one the way the provider expects. Hooks and client assertion getters also receive the authorization server's `issuer` when Better Auth knows it.

---
"@better-auth/oauth-provider": patch
---

An authorize request that omits `scope` now falls back to the operator's `clientRegistrationDefaultScopes` (intersected with the client's persisted set) instead of the client's whole persisted capability set, so consent no longer asks for allowed-but-non-default scopes the client did not request.

---
"@better-auth/oauth-provider": minor
---

An authorization request that omits `scope` now gets only the client's scopes that are also in `clientRegistrationDefaultScopes`, instead of every scope the client may request, so consent no longer asks for scopes you allowed but did not make default. When you do not set `clientRegistrationDefaultScopes`, nothing changes, and a request that sends `scope` is unaffected. A default list without `openid` makes a request without `scope` plain OAuth, with no ID token.

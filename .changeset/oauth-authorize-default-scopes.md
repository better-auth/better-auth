---
"@better-auth/oauth-provider": minor
---

When an authorization request omits `scope`, its default scopes now come from the intersection of the client's registered scopes and `clientRegistrationDefaultScopes`. Scopes listed only in `clientRegistrationAllowedScopes` must be requested explicitly. If you leave the default scopes unset, the client keeps its previous defaults.

With `requireOpenId: true`, omitting `scope` still returns `invalid_scope` before the provider applies defaults. Otherwise, a default list without `openid` makes the request plain OAuth, and an empty list grants no scopes. A request that also sends `claims` needs `openid` and fails with `invalid_request` if the defaults leave it out.

---
"@better-auth/oauth-provider": patch
---

Refreshing an `offline_access` grant after its session has expired now issues tokens without a `sid`. Previously the new tokens carried the expired session id, so `/oauth2/introspect` reported them inactive and `/oauth2/userinfo` returned 401 `invalid_token`. Refreshes while the session is live are unchanged.

A refresh token without `offline_access`, such as one narrowed by a scope request, now returns `invalid_grant` once its session has ended, and `/oauth2/introspect` reports it inactive, matching what sign-out already does. A refresh that drops `offline_access` after the session has ended, by its scope request or by a resource whose `allowedScopes` omit it, is refused the same way. Previously both refreshes succeeded, but the access tokens they issued were reported inactive.

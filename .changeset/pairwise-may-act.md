---
"@better-auth/oauth-provider": minor
---

Introspection no longer shows a pairwise client the user ID in `may_act.sub`. It presents that user by the `sub` the client sees, and JWT access tokens do the same when `accessTokenSubject` is `"pairwise"`. With the default `accessTokenSubject: "user"`, JWTs still carry the user ID, as they do in `sub`. The exchange still matches the user ID. A `may_act` that names a service by `sub` needs `sub_profile: "service"` to keep its client ID.

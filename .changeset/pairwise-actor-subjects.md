---
"@better-auth/oauth-provider": minor
---

Delegated access tokens no longer show a pairwise client the user IDs of users who acted through token exchange. When the token's client uses pairwise subject identifiers, each user in `act` is named by the `sub` that client sees for that user. Introspection always returns those values, and JWT access tokens carry them with `accessTokenSubject: "pairwise"`. A service named in `act` keeps its client ID, and `may_act` still matches user IDs.

---
"@better-auth/oauth-provider": minor
---

Introspection of a delegated access token no longer shows a pairwise client the user IDs of users who acted through token exchange. Each user in `act` is named by the `sub` that client sees for that user. JWT access tokens carry the same values when `accessTokenSubject` is `"pairwise"`; with the default `"user"`, they still carry user IDs in `act`. A service named in `act` keeps its client ID, and `may_act` still matches user IDs.

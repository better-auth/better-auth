---
"@better-auth/oauth-provider": minor
---

Each actor in a delegated token's `act` now carries `sub_profile`: `"service"` for a client and `"user"` for a user. A pairwise client sees a service's client ID in `act`, even after that client is deleted. `may_act` can require an actor's kind with `sub_profile`, and `actorClaims` can no longer set it. A grant extension that passes `act` to `issueTokens` must set `sub_profile: "service"` on client actors, or pairwise clients see those client IDs as pairwise values. Tokens delegated before this release have no `sub_profile`, so pairwise clients see their service actors as pairwise values.

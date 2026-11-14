---
"@better-auth/oauth-provider": minor
---

Pairwise clients can now receive their pairwise `sub` in JWT access tokens, so decoding one no longer reveals the user ID in `sub`. Set `accessTokenSubject: "pairwise"` with `pairwiseSecret` to opt in. These tokens also carry the user ID encrypted in a `ba_uid` claim, which UserInfo, introspection, and token exchange use to find the user.

Resource servers that read `sub` from these tokens see a different value for the same user under each sector. The default, `"user"`, keeps the user ID in `sub`. In delegated tokens from token exchange, each user in `act` is named by the `sub` that client sees for that user, and a service keeps its client ID.

---
"@better-auth/oauth-provider": minor
---

The provider now owns the `ba_uid` and `ba_act` access token claims, so a value for either name from `customAccessTokenClaims`, an extension, or a resource's `customClaims` is dropped with a warning. A JWT access token issued before the upgrade that carries your own `ba_uid` or `ba_act` is inactive until the client refreshes it. Rename your claim if you set either name.

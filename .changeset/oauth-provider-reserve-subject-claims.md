---
"@better-auth/oauth-provider": minor
---

The provider now owns the `ba_sub` access token claim, so a value for it from `customAccessTokenClaims`, an extension, or a resource's `customClaims` is dropped with a warning. A JWT access token issued before the upgrade that carries your own `ba_sub` is inactive until the client refreshes it. Rename your claim if you set `ba_sub`.

---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider): add `customTokenResponseFields` callback and Zod validation for authorization codes

Add `customTokenResponseFields` callback to `OAuthOptions` for injecting custom fields into token endpoint responses across all grant types. Standard OAuth fields (`access_token`, `token_type`, etc.) cannot be overridden. Follows the same pattern as `customAccessTokenClaims` and `customIdTokenClaims`.

Authorization code verification values are now validated with a Zod schema at deserialization, consistently returning `invalid_verification` errors for malformed or corrupted values instead of potential 500s.

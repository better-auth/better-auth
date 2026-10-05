---
"@better-auth/oauth-provider": patch
---

With `refreshTokenReuseInterval` set, concurrent refresh requests that use the same refresh token now all receive the same token response, instead of all but one failing with `invalid_grant`. With the default interval of `0`, rotation stays strict.

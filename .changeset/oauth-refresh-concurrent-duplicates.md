---
"@better-auth/oauth-provider": patch
---

Answer concurrent duplicate refresh requests with the same token response inside `refreshTokenReuseInterval`. A request that lost the rotation, or arrived before the winning request stored its response, now waits briefly for that response instead of failing with `invalid_grant`. With the default interval of `0`, rotation stays strict.

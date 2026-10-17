---
"@better-auth/oauth-provider": patch
---

With `refreshTokenReuseInterval` set, a refresh request that races another request for the same refresh token, with the same scopes, resources and sender constraint, now receives that request's token response instead of `invalid_grant`. It waits up to 5 seconds for the response. DPoP-bound duplicates that race the rotation, and requests that do not match, still fail with `invalid_grant`. With the default interval of `0`, rotation stays strict.

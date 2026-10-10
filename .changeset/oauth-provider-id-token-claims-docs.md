---
"@better-auth/oauth-provider": patch
---

Export `userNormalClaims` for utilization in `customIdTokenClaims` allowing for scope-based `profile` and `email` claims in the ID token to mimic the same claim response as the userinfo endpoint.

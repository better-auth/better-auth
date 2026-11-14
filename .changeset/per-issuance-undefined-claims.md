---
"@better-auth/oauth-provider": minor
---

Access-token claims set to `undefined` are now left out instead of removing a claim of the same name from a lower-priority source. The rule covers every access-token claim source: extension claims, per-issuance `accessTokenClaims`, `customAccessTokenClaims`, and per-resource `customClaims`. It matches how ID token and UserInfo claims already work, and JWT and opaque access tokens now return the same claims.

**Behavior change:** before, `customAccessTokenClaims: () => ({ tenant: user.tenantId })` with no `tenantId` removed a `tenant` claim that an extension or `issueTokens` set, in both token formats. A per-issuance `undefined` did the same in JWT access tokens. The lower-priority value now stays. To override it, return a value, such as `null`.

---
"@better-auth/sso": patch
---

OIDC sign-in blocked by `disableImplicitSignUp` now redirects with `?error=signup_disabled` instead of `?error=signup%20disabled`, so the error code is consistent with the rest of Better Auth.

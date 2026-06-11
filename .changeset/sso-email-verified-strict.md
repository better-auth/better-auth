---
"@better-auth/sso": patch
---

With `trustEmailVerified` enabled, an OIDC `email_verified` claim or mapped SAML attribute whose value is the string `"false"` is no longer treated as a verified email. Only a boolean `true` or the string `"true"` counts as verified.

---
"@better-auth/sso": patch
---

Reject OIDC SSO provider registration when the configured issuer differs from the discovery document, including trailing slash mismatches, instead of failing later during sign-in. Existing providers with a mismatched issuer are unchanged and must be reconfigured to match the discovery document.

---
"@better-auth/sso": patch
---

Normalize the SSO OIDC `signup disabled` error to `signup_disabled` when redirecting after `disableImplicitSignUp` blocks an unknown user, matching the convention used by SAML, the core OAuth callback, and the generic OAuth plugin.

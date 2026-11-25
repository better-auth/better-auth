---
"better-auth": patch
---

SAML SSO sign-in now preserves OAuth server context across the IdP redirect and populates `getOAuthState()` on the ACS callback, so `@better-auth/oauth-provider` authorization resumes after SAML login.


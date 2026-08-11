---
"@better-auth/sso": patch
---

Automatic organization assignment from an email domain now requires a verified provider domain and a verified stored user email, so a social sign-in no longer joins an organization whose SSO provider only claims that domain. Explicit organization-bound OIDC and SAML provisioning is unchanged.

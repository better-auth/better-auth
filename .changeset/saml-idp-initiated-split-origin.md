---
"@better-auth/sso": patch
---

IdP-initiated SAML sign-ins in split-origin deployments can now return users to a configured application URL after authentication or a validation error, instead of falling back to the authentication server. Configure `idpInitiatedCallbackUrl` globally or per provider.

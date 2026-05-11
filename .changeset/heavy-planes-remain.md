---
"@better-auth/sso": patch
---

add support for multiple SAML idp certs. The `getSSOProvider`, `listSSOProviders`, and `updateSSOProvider` responses now returns `samlConfig.certificate` as `ParsedCert | ParsedCert[]`.

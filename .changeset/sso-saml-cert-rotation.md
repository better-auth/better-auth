---
"@better-auth/sso": patch
---

SAML providers that already have linked accounts can rotate their IdP signing certificate again. Since 1.7.0, changing `cert` or `idpMetadata.cert` through `updateSSOProvider` returned 409 `Cannot change SSO provider identity fields while linked accounts exist`, so the only way to rotate was to delete the provider, which also removed its account links and domain verification. `guardProviderMutation` still receives certificate changes as authentication-boundary changes, so a guard that rejects those keeps blocking them.

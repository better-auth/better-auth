---
"@better-auth/sso": patch
---

SAML providers that set `samlConfig.callbackUrl` as their Assertion Consumer Service URL, without supplying `spMetadata.metadata`, can sign in again. Since 1.6.21, every response sent to that URL failed with `invalid_saml_response` and a message that the bearer `Recipient` does not match this Service Provider. Providers that supply SP metadata XML were not affected.

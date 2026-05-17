---
"@better-auth/sso": minor
---

SAML SSO providers can now declare multiple IdP signing certificates for rolling rotation. Pass `samlConfig.cert` (or `samlConfig.idpMetadata.cert`) as either a single PEM string or an array of PEMs; responses signed by any of the listed certificates are accepted.

`samlConfig.cert` is now optional. Providers configured via `idpMetadata.metadata` XML can omit it entirely; the signing certificates are read from the metadata document. Registration and update reject configurations that mix `idpMetadata.metadata` with an explicit `cert` or `idpMetadata.cert`, since samlify ignores the explicit values in that mode.

`getSSOProvider`, `listSSOProviders`, and `updateSSOProvider` now read `samlConfig.idpMetadata.cert` first and fall back to `samlConfig.cert`, matching the precedence used during response validation. `samlConfig.certificate` is a single parsed certificate when one cert is configured, an array when multiple are configured, and absent when certificates are embedded in `idpMetadata.metadata`.

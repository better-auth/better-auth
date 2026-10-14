---
"@better-auth/sso": patch
---

Updating an SSO provider with a partial `mapping` no longer fails validation. Since v1.7.0, `updateSSOProvider` rejected any OIDC or SAML mapping that left out `email` or `name`, even though both have documented defaults and v1.6 accepted them. `registerSSOProvider` now accepts these mappings too. Omitted fields fall back to the defaults. A mapping that passes `id` is still rejected, as described in the v1.7 upgrade guide.

---
"@better-auth/core": minor
"@better-auth/sso": minor
"better-auth": minor
---

Scope account identity by trusted issuer instead of provider configuration. Accounts now use the unique `(issuer, providerAccountId)` key, so aliases for one OpenID Connect issuer deduplicate one external identity while equal subjects from different issuers remain separate. This identity deduplication does not introduce independent grant or provider lifecycle records for aliases.

This release is breaking. `Account.accountId` is renamed to `Account.providerAccountId`, and `Account.issuer` is required. Account-specific APIs select the local `Account.id` through `accountId`; token and provider-profile APIs can instead select the signed account cookie with `useAccountCookie: true`. Credential accounts use `local:credential` and the linked user's stable `id` as their provider identity.

OAuth provider identity now comes from raw verified profiles. OpenID Connect discovery uses `sub`, plain OAuth uses `id`, and providers can declare `accountSubject` for another immutable field; Better Auth no longer switches between `sub` and `id` at runtime. `getUserInfo().user` no longer carries provider identity, and `mapProfileToUser` cannot return `id`. Read the selected identity from `accountInfo.account.providerAccountId` instead of `accountInfo.user.id`. The generic `microsoftEntraId` helper now requires a concrete tenant GUID; use the built-in Microsoft provider for multi-tenant authorities.

SSO account subjects are now protocol-defined. OIDC uses the verified `sub` claim, and SAML uses the signed `NameID`; `mapping.id` is removed from both configurations. A manual SAML configuration without metadata XML must set `idpMetadata.entityID`, because `samlConfig.issuer` identifies the service provider and no longer acts as the IdP identity.

Apply the reviewed account-identity backfill in the Better Auth 1.7 upgrade guide before deploying. The generated schema migration cannot assign trusted issuers or resolve existing identity collisions automatically.

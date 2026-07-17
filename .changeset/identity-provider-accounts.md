---
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/kysely-adapter": minor
"@better-auth/memory-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/prisma-adapter": minor
"@better-auth/scim": minor
"@better-auth/sso": minor
"@better-auth/test-utils": patch
"auth": minor
"better-auth": minor
---

Separate durable provider identities from provider-specific authentication state. The new `Identity` model owns `userId`, `issuer`, and `providerAccountId`. Each `Account` references an Identity and keeps its own provider alias, credentials, tokens, grants, and lifecycle.

Account APIs return the Identity under `account.identity`; `providerInstanceId` remains server-only. Generic OAuth replaces account-key callbacks with `OAuthIdentityKeyContext`, `identitySubject`, and `identityIssuer`. Deleting a persisted SSO provider removes only its Accounts, while retaining the User, Identity, and other provider Accounts. SSO callbacks are rejected if their provider changes or is deleted after authentication starts. SCIM exposes its `connectionId` through the typed `validateUserInfo` source.

OAuth providers without an issuer use the synthetic `local:oauth:<encoded providerId>` issuer, which stays separate from the `local:<providerId>` namespace that credential, SIWE, and the other built-in methods use.

Implicit same-email linking now always requires the existing Better Auth User's local email to be verified. The `account.accountLinking.requireLocalEmailVerified` opt-out is removed.

TikTok uses `union_id` as its stable Identity subject instead of the app-scoped `open_id`, and rejects authentication when TikTok does not return that field. TikTok sign-in now requests `user.info.basic` alongside `user.info.profile`, because the identity subject, display name, and avatar belong to that scope. Enable both scopes on your TikTok app.

SSO provider IDs and domains are validated during registration, updates, and startup configuration. Provider IDs must be URL-segment-safe, and every entry in a provider's domain list must resolve to a hostname.

An SSO provider ID may reuse a built-in method ID, a social provider ID, a trusted provider ID, or a SCIM provider ID. Only a configured `defaultSSO` provider ID stays reserved. Registration previously rejected all of them.

SIWE wallet records now belong to the corresponding Account through `accountId`. Unlinking the Account removes its wallet metadata on every adapter, including adapters without foreign-key cascades.

Provider-account cookies issued before this release are rejected and replaced during the next provider authentication.

Custom adapters must provide either interactive transactions or `commitAtomicWrites` for multi-record identity lifecycle changes and database-backed single-use verification consumption. Dynamically registered SSO providers require interactive transactions. Drizzle's `transaction` option now accepts `"async"`, `"sync"`, or `false`; Kysely, Drizzle, and Prisma enable transactions by default when supported by their drivers.

Plugin provisioning methods must augment `UserProvisioningSourceRegistry`. The plugin-facing `internalAdapter` now exposes atomic User, Identity, and Account lifecycle methods, including `createUserWithAccount`, `linkAccount`, and `listUserAccounts`, instead of independent Account creation and legacy account-key methods.

With `usePlural: true`, model identifiers ending in a consonant followed by `y` now use `ies`, and generated relation keys follow the same rule.

Database `after` hooks run after the surrounding database operation commits. Hook errors still reach the caller, but they do not roll back the committed operation. Use a `before` hook for validation that must prevent a write.

This release requires a reviewed Identity and Account migration, plus a SIWE wallet backfill when that plugin is enabled. Follow the Better Auth 1.7 upgrade guide before deploying.

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

SIWE wallet records now belong to the corresponding Account through `accountId`. Unlinking the Account removes its wallet metadata on every adapter, including adapters without foreign-key cascades.

Provider-account cookies issued before this release are rejected and replaced during the next provider authentication.

Custom adapters must provide either interactive transactions or `commitAtomicWrites` for multi-record identity lifecycle changes and database-backed single-use verification consumption. Dynamically registered SSO providers require interactive transactions. Drizzle's `transaction` option now accepts `"async"`, `"sync"`, or `false`; Kysely, Drizzle, and Prisma enable transactions by default when supported by their drivers.

Database `after` hooks run after the surrounding database operation commits. Hook errors still reach the caller, but they do not roll back the committed operation. Use a `before` hook for validation that must prevent a write.

This release requires a reviewed Identity and Account migration, plus a SIWE wallet backfill when that plugin is enabled. Follow the Better Auth 1.7 upgrade guide before deploying.

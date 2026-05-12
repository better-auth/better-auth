---
"@better-auth/scim": patch
---

`POST /scim/generate-token` accepted a `providerId` that collided with a built-in `account.providerId` value (`credential`, `email-otp`, `magic-link`, `phone-number`, `anonymous`, `siwe`, or any configured social provider key), so a SCIM caller could mint a token that authenticated against accounts it never provisioned.

`generateSCIMToken` now rejects `providerId` values that collide with the built-in account provider list, returning `BAD_REQUEST` at issuance. The configured-social-provider check reads from `options.socialProviders` rather than the resolved provider list so that providers disabled with `enabled: false` are still rejected: their account rows can persist from when the provider was enabled.

`providerOwnership.enabled` stays default `false` on this patch release so existing SQL deployments do not need a schema migration mid-upgrade. The follow-up on `next` flips the default to `true` and ships the corresponding `scimProvider.userId` schema column so non-organization SCIM tokens are owner-locked by default. Operators who need owner-locking immediately can opt in today with `scim({ providerOwnership: { enabled: true } })` and add the `userId` column manually.

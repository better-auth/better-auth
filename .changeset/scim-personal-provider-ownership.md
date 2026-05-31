---
"@better-auth/scim": minor
---

Personal (non-organization) SCIM connections now always belong to the user who created them. Owner binding used to be opt-in through the `providerOwnership` option, which defaulted to off. With it off, a personal connection was stored without an owner, and the management endpoints denied access only when a stored owner differed from the caller. An unowned connection passed that check for any signed-in user, who could read it, list it, regenerate its token, or delete it. Regenerating the token rotated the secret and invalidated the original.

`generateSCIMToken` now records the creator's `userId` on every personal connection. The `generate-token`, `list-provider-connections`, `get-provider-connection`, and `delete-provider-connection` endpoints grant access only to that owner. Organization-scoped connections keep their existing behavior and continue to use organization membership and the configured `requiredRole` checks.

This release is breaking. It removes the `providerOwnership` option, and owner binding can no longer be disabled. The `scimProvider.userId` column is now a permanent part of the schema, so run a migration after upgrading with `npx auth migrate` or `npx auth generate`.

Connections created before this release carry no owner. Access now fails closed, so those connections are no longer reachable through the management endpoints, including token regeneration. Reclaim them at the database level: delete `scimProvider` rows that have neither `organizationId` nor `userId`, or set `userId` to the intended owner, then regenerate tokens as needed. Organization-scoped connections are not affected.

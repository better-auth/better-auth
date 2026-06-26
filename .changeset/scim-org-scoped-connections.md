---
"@better-auth/scim": minor
---

Runtime SCIM tokens now require `organizationId`; use `staticProviders` for app-level SCIM.

SCIM-managed accounts now use namespaced provider IDs (`scim:{organizationId}:{providerId}` or `scim:{providerId}` for app-level static providers). Migrate only known SCIM-managed account rows before upgrading; leave non-SCIM accounts unchanged even when they share the same provider ID.

Organization-scoped `active: false` now makes a user inactive in that organization while keeping SCIM group and team associations available for reactivation. Use `DELETE` to fully deprovision organization-scoped SCIM state.

`defaultSCIM` has been replaced by `staticProviders`. `linkExistingUsers.trustedDomains` has been removed; use `requireExistingOrgMembership`, `shouldLinkUser`, or explicit `true` instead.

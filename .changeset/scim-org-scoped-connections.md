---
"@better-auth/scim": minor
---

SCIM runtime tokens now require `organizationId`; use `staticProviders` for app-level SCIM.

SCIM account rows now store provider keys as `scim:{organizationId}:{providerId}` or `scim:{providerId}`. Migrate existing SCIM account rows before upgrading.

Organization-scoped deprovisioning now removes the user from that organization and keeps the global user record. App-level static providers keep the previous global-user behavior.

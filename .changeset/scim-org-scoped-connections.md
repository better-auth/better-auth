---
"@better-auth/scim": minor
---

SCIM connections are now independent of the Organization and SSO plugins. Define
them statically, resolve them with `authentication.verifyBearerToken`, or use the
optional `managedConnections` catalog.

Legacy connection management, organization-scoped configuration, and SCIM-created
authentication accounts are removed. Use identity and projection callbacks to
connect SCIM resources to application users and roles.

Legacy SCIM state is not migrated. Back it up, issue new credentials, and fully
reprovision Users and Groups after upgrading.

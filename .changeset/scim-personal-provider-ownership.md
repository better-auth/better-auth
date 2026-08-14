---
"@better-auth/scim": minor
---

Remove the legacy user-session connection management endpoints and
`providerOwnership`. Applications now authorize their own SCIM administration
workflows instead of relying on Better Auth user ownership.

Legacy `scimProvider` rows and credentials are not migrated. Follow the 1.7 SCIM
upgrade guide, issue new credentials, and fully reprovision Users and Groups.

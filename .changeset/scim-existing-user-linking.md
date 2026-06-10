---
"@better-auth/scim": patch
---

SCIM user provisioning no longer links to a pre-existing user by matching email alone. When a user with the same email already exists, `createSCIMUser` now returns `409` (uniqueness) unless the new `linkExistingUsers` option explicitly opts in (via `true`, `trustedDomains`, `requireExistingOrgMembership`, or a `shouldLinkUser` callback). Additionally, an organization-scoped SCIM `DELETE` now deprovisions the user — removing their organization membership and the SCIM account link — instead of deleting the global Better Auth user. A new `canGenerateToken` option lets applications authorize SCIM token creation, including restricting personal (non-org) tokens.

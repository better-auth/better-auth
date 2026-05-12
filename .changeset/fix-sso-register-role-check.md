---
"@better-auth/sso": patch
---

fix(sso): require org admin role to register SSO providers

`POST /sso/register` previously allowed any organization member to register an
SSO provider for the organization when `organizationId` was supplied, only
checking membership and not role. This brings it in line with the other
provider endpoints (`get`/`update`/`delete`), which go through
`checkProviderAccess` → `isOrgAdmin` and restrict access to `owner` or `admin`
roles.

Closes #9133.

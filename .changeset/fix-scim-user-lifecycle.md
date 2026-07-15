---
"@better-auth/scim": patch
---

Support `GET /scim/v2/Users?filter=externalId eq "..."`, the standard pre-provision existence check all major SCIM providers (Okta, Azure AD, Rippling) perform before creating a user. Previously this returned `400 The attribute "externalId" is not supported` because `externalId` lives on the `account` model (as `accountId`) rather than on the `user` model filtered by the other list filters.

---
"@better-auth/scim": patch
---

Fix `GET /scim/v2/Users?filter=externalId eq "..."` returning the wrong account's `externalId` when a user has more than one SCIM account for the same provider (possible via `linkExistingUsers`). The user-ID scoping was already correct; the resource-building step looked up the account from the unfiltered account list instead of the `externalId`-matched one.

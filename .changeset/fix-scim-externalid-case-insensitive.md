---
"@better-auth/scim": patch
---

Match the `externalId` filter attribute name case-insensitively (e.g. `ExternalId eq "..."`, `EXTERNALID eq "..."`), per RFC 7644 §3.4.2.2 which specifies that SCIM attribute names are case-insensitive. Previously only the exact-case `externalId` was recognized before falling through to the generic filter path and returning `400`.

---
"@better-auth/scim": patch
---

SCIM Group membership and projection-grant writes now insert many rows of one model with `createMany` instead of sequential `create`.

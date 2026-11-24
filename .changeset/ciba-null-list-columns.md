---
"@better-auth/ciba": patch
---

CIBA now works on databases that reject `null` in list columns, such as Prisma on PostgreSQL, CockroachDB, and MongoDB. Backchannel authentication requests without `acr_values` or `resource`, and approvals that state no authentication methods, previously failed with a server error. ID tokens for those approvals carry no `amr` claim.

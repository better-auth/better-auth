---
"@better-auth/prisma-adapter": patch
---

If you use the Prisma adapter with PostgreSQL or MongoDB, `incrementOne` and `update` calls that filter with `mode: "insensitive"` now match rows whose stored value differs only in case. Previously `incrementOne` with a non-id filter, or `update` that combined an id or unique field with an insensitive filter, compared that filter case-sensitively and returned `null` for a mixed-case row. Other providers, which ignore `mode`, are unaffected.

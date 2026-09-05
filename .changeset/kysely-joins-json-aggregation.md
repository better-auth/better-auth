---
"@better-auth/kysely-adapter": patch
---

Rework `experimental.joins` to load related rows with the database's JSON aggregation functions (Kysely's recommended approach for relations) instead of a flat join with in-memory grouping. Results are the same for typical queries. Two edges to note: one-to-many relations are now ordered by id, and one that exceeds its `limit` returns the lowest-id rows.

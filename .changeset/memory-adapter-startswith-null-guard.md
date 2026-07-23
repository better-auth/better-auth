---
"@better-auth/memory-adapter": patch
---

Fix `starts_with` and `ends_with` filters throwing a `TypeError` when a queried field is `null` or absent. They now exclude such rows (matching the `contains` operator and the SQL/Prisma/Mongo adapters) instead of crashing the whole query.

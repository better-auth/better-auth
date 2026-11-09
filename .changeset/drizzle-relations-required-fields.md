---
"@better-auth/drizzle-adapter": minor
---

Generate non-nullable Drizzle Relations v2 columns for fields whose `required` flag is omitted. Regenerating existing schemas may require a nullability migration. Backfill existing `NULL` values before applying `NOT NULL` constraints.

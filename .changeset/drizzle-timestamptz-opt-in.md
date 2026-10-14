---
"better-auth": minor
"@better-auth/core": minor
"auth": minor
---

Add opt-in `timestamptz` generation for the Drizzle CLI schema on PostgreSQL. Set `advanced.database.useTimestamptz: true` and `auth generate` emits `timestamp("<column>", { withTimezone: true })` for every date column instead of the default bare `timestamp("<column>")`, so absolute instants such as `expiresAt` read back identically regardless of the reader's time zone. Defaults to `false`: existing generated schemas are byte-identical, and SQLite/MySQL output is unchanged. Regenerating only changes the generated file — migrate existing `timestamp without time zone` columns with `ALTER TABLE <table> ALTER COLUMN <column> TYPE timestamptz USING <column> AT TIME ZONE 'UTC'`.

---
"@better-auth/oauth-provider": patch
---

Client `metadata` is now written to the `json` column as an object instead of a JSON string, so Postgres `jsonb` operators such as `->` and `@>` work on it with adapters that pass JSON through natively (Drizzle `pg`). Rows written as strings by earlier versions are still read.

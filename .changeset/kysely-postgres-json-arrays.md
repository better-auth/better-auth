---
"@better-auth/kysely-adapter": patch
---

The Kysely adapter on PostgreSQL now saves `json` fields whose value is an array. Before, writing an array such as `[{ type: "payment" }]` to a plugin's `json` field failed with `invalid input syntax for type json`. JSON objects were not affected.

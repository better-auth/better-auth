---
"@better-auth/kysely-adapter": patch
---

On MySQL with `generateId: "serial"`, a `create` that fails because the table reports no auto-increment id no longer leaves the inserted row behind, so retrying does not fail with a duplicate key error.

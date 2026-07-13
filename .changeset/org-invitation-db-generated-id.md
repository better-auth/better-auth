---
"better-auth": patch
---

Organization invitations now let the database generate their `id` when ID generation is delegated to the database (e.g. `advanced.database.generateId: "uuid"` with a UUID-capable adapter such as Postgres), matching every other model. Previously `createInvitation` always generated the invitation `id` in application code, so invitation rows received an app-generated value instead of a database-generated one while organizations, members and teams correctly deferred to the database ([better-auth/better-auth#10024](https://github.com/better-auth/better-auth/issues/10024)). A caller-provided id (e.g. via `beforeCreateInvitation`) is still honored.

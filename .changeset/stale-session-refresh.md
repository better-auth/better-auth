---
"better-auth": patch
---

Apps that use `secondaryStorage` with `session.storeSessionInDatabase: true`: a session refresh or profile update no longer writes a revoked session back to secondary storage. Before, if the store returned a stale copy (for example, a read replica that had not yet applied the sign-out), the revoked session was accepted again until its cached copy expired, which could be the full session lifetime. With `preserveSessionInDatabase`, a refresh also no longer extends a session that has already ended.

Apps that keep sessions only in secondary storage, or only in the database, are unaffected.

If you use the Drizzle adapter with MySQL, upgrade `@better-auth/drizzle-adapter` to the same version. With an older adapter, every session refresh signs the user out.

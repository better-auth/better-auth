---
"@better-auth/core": patch
"better-auth": patch
---

`internalAdapter.listSessions` now types its rows with the extra session fields that plugins and `session.additionalFields` add, such as the admin plugin's `impersonatedBy`. Reading them no longer needs a cast, and `listSessions<T>()` can type them precisely.

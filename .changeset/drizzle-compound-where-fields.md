---
"@better-auth/drizzle-adapter": patch
---

Reject missing Drizzle schema fields before building compound `where` clauses, preventing malformed SQL when an application schema is out of date.

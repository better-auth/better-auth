---
"@better-auth/drizzle-adapter": patch
---

The `relations-v2` Drizzle adapter no longer throws `Unexpected 'undefined' in filter value` on drizzle-orm 1.0.0-rc.5 and later when a joined `findMany` has no `where`, such as listing an organization's members or invitations. The query now returns the rows unfiltered.

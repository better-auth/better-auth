---
"@better-auth/drizzle-adapter": patch
---

Add a `supportsDates` option to the Drizzle adapter. Set it to `false` when your date columns are declared as `text()`, so Better Auth writes an ISO 8601 string instead of a raw `Date` that strict drivers such as Cloudflare D1 reject.

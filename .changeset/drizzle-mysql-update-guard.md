---
"@better-auth/drizzle-adapter": patch
---

Drizzle adapter on MySQL, including the `relations-v2` entry: an update whose `where` clause has a range condition on a field it changes, such as setting `expiresAt` while matching `expiresAt > now`, now returns the updated row. Before, it returned `null` even though the row was updated. Session refresh in `better-auth` relies on this when `secondaryStorage` and `session.storeSessionInDatabase` are both enabled, so upgrade both packages together.

---
"@better-auth/api-key": patch
---

Listing API keys now returns every key of a user or organization. Before, the list and its `total` stopped at the database adapter's `defaultFindManyLimit` (100 by default), and with `fallbackToDatabase` secondary storage could keep caching only part of the keys.

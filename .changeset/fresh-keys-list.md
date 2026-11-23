---
"@better-auth/api-key": minor
---

API key listings now read from the database in every storage mode, so concurrent writes by instances sharing that database cannot cause keys to disappear from listings.

The plugin requires the `apikey` table and removes `fallbackToDatabase`. Secondary storage caches reads by credential and by ID. If you stored keys only in secondary storage, apply the schema and import those keys before serving traffic with 1.8. The [1.8 upgrade guide](https://better-auth.com/docs/guides/1-8-upgrade-guide#api-key-storage) shows how to preserve existing credentials.

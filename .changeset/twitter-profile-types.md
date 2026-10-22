---
"@better-auth/core": minor
---

Nested `TwitterProfile` entity objects, arrays, and URL details can now be omitted or `null`; update typed reads to handle both. The types also include description cashtags, mentions, and URL preview metadata; request extra `user.fields` on `/2/users/me` in custom profile lookups.

---
"better-auth": patch
---

A session cached in `secondaryStorage` while its user could not be read no longer breaks `getSession`. The user is now read from the database, where `getSession` previously failed for every request until the cached session expired.

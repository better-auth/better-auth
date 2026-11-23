---
"better-auth": patch
---

A session cached in `secondaryStorage` without its user no longer breaks `getSession`. The user is now read from the database, where `getSession` previously failed for every request until the cached session expired.

---
"better-auth": minor
---

Device Authorization now creates database indexes for device and user code lookups. Codes longer than 191 characters are rejected. Existing MySQL and SQL Server installations must convert these columns to bounded strings and resolve oversized values before running the migration.

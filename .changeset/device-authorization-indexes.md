---
"better-auth": minor
---

Device Authorization now creates unique database indexes for `deviceCode` and `userCode`, so each generated code must be unique in its column. Existing installations on every adapter must resolve duplicate values before applying the migration. MySQL and SQL Server installations must also convert both columns to bounded strings and clean up values longer than 191 characters before running it.

Generated codes are limited to 191 characters. Issuance makes up to 3 attempts to overcome unique-key collisions, then returns `server_error` if it cannot create a unique `deviceCode` and `userCode`. Default-generated user codes accept case changes and readability separators during verification, approval, and denial; custom codes outside the default alphabet are matched exactly. The `/device` limiter allows 5 requests over a window equal to the configured code lifetime, while `/device/token` polling keeps its separate interval behavior.

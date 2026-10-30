---
"better-auth": patch
---

Fix adding a team member on Postgres failing with `current transaction is aborted` (25P02) instead of returning the existing member or the original insert error

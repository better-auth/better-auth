---
"better-auth": patch
---

The admin `update-user` endpoint now rejects `data.id` with a 400 error instead of attempting to change the user's primary key.

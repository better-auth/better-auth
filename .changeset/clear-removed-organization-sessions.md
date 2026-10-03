---
"better-auth": patch
---

Clear the active organization selection from all of a user's server-backed
sessions when that member is removed or leaves, and resolve organization route
sessions authoritatively when a durable session store is configured.

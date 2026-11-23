---
"better-auth": patch
---

Fix `/device/code` returning a 500 on a user or device code collision with the Drizzle adapter. The collision is now retried with a new code, as with the other adapters.

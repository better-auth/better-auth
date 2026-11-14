---
"better-auth": patch
---

Fixed `/device/code` returning a 500 on a user or device code collision with the Drizzle adapter, instead of retrying with a new code.

---
"better-auth": patch
---

The admin `create-user` endpoint no longer leaves an orphaned user behind when the password is rejected by the `haveIBeenPwned` plugin.

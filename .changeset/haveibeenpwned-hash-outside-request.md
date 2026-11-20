---
"better-auth": patch
---

Fix `password.hash` from `auth.$context` throwing "No auth context found" outside a request when the `haveIBeenPwned` plugin is enabled, such as in a seed or migration script. Such a password is now hashed without a breach check, like one hashed on a path the plugin does not check.

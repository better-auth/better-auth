---
"better-auth": patch
---

OAuth account-linking and create-user error logs now respect a custom `logger` configured in `betterAuth()`, instead of always being written to the default console logger.

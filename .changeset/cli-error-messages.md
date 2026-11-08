---
"auth": patch
---

Fixed CLI errors that printed a stack trace instead of the cause. Config and database errors now show their message, a mistyped `--config` path says the file doesn't exist, and `auth mcp` and `auth ai` no longer report success after a failed step.

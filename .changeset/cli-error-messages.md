---
"auth": patch
---

Fixed CLI error messages that hid the cause or reported success after a failure. A config that fails to load now shows its error and the line in your code instead of a stack trace, a mistyped `--config` path says the file doesn't exist, database connection errors print their cause instead of a stack trace, `auth check` names the error code when it can't validate the schema, and `auth mcp` and `auth ai` no longer print next steps or "Done!" after a failed step.

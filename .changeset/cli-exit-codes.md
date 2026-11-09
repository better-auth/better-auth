---
"auth": patch
---

Fixed the CLI exiting with code 0 after a canceled or failed run, so scripts no longer continue as if it succeeded. Canceling a prompt or pressing Ctrl+C now exits with 130, and failures such as a missing configuration file or a failed `auth mcp` setup exit with 1.

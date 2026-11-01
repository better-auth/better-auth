---
"auth": patch
---

`auth ai` no longer overwrites an MCP config file it cannot parse, such as one with comments or trailing commas. It leaves the file unchanged and prints the config to add manually.

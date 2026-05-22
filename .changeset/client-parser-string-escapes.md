---
"better-auth": patch
---

`parseJSON` now decodes escape sequences such as `\n`, `\\`, and `\uXXXX` in quoted strings. Values such as organization metadata that round-trip through `JSON.stringify` and back no longer come out with raw escape characters in place of the original characters.

---
"better-auth": patch
"@better-auth/core": patch
---

Add an `enabledPaths` option that serves only the listed paths and returns `404 Not Found` for every other path. Entries match exactly, or as a wildcard pattern when they contain `*`, so an app that uses a few endpoints no longer has to list every other path in `disabledPaths`.

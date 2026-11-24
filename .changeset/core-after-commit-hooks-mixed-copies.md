---
"@better-auth/core": patch
---

After-commit hooks run again when an app loads more than one copy of `@better-auth/core`. Since 1.7.28, a hook queued by one copy and run by a copy from a different release failed with `TypeError: hook is not a function`, so cache evictions and other after-commit work were skipped or the committed request was rejected.

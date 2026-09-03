---
"auth": patch
---

`auth upgrade` now skips non-semver dependency specifiers, including pnpm catalogs, with a clear warning instead of crashing.

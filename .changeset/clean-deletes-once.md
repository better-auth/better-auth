---
"better-auth": patch
---

Run single-row `delete.after` hooks only for the caller that actually removes the row. Concurrent callers may still each run `delete.before` after reading the row; a missing or failed preliminary read now prevents deletion when a `delete.before` hook is configured.

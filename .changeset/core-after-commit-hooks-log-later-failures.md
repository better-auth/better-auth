---
"@better-auth/core": patch
---

When a committed transaction has several failing after-commit hooks and no `onAfterCommitHookError` handler, the first failure is still thrown and later failures from hooks that run are now logged. Previously only the first was reported, so a failed secondary-storage session revocation after a failing `session.delete.after` hook went unnoticed.

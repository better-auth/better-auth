---
"@better-auth/core": patch
---

When several after-commit hooks fail, the first failure is still thrown and each later failure is now logged. Previously only the first was reported, so a failed secondary-storage session revocation after a failing `session.delete.after` hook went unnoticed.

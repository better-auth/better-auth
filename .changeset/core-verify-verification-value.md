---
"@better-auth/core": patch
---

`InternalAdapter` now declares `verifyVerificationValue`, which checks a guess against a stored one-time code and counts the attempt before comparing it, and exports its `VerificationAttemptResult` type.

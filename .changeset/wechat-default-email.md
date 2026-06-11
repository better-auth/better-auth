---
"@better-auth/core": patch
---

WeChat sign-in now succeeds with the documented default setup, which previously failed because WeChat returns no email address. The created user receives a stable, unverified placeholder email; supply a real one with `mapProfileToUser`.

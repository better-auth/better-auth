---
"better-auth": patch
---

Password reset tokens are now consumed atomically before the password changes, so two concurrent reset requests carrying the same token can no longer both succeed.

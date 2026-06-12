---
"better-auth": patch
---

One-time tokens are now consumed atomically, so two concurrent redemptions of the same token can no longer both return a session.

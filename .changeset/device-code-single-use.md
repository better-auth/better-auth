---
"better-auth": patch
---

Approved device codes are now claimed atomically during token polling, so concurrent polls can no longer redeem the same device code more than once.

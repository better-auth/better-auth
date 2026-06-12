---
"@better-auth/electron": patch
---

Electron authorization codes are now consumed atomically, so concurrent token exchanges of the same code can no longer both mint a session.

---
"@better-auth/electron": patch
---

Fixed the main process never loading the stored session on startup. It now also refetches the session on `refetchInterval`, when an app window gains focus, and when the network reconnects, and skips those refetches while offline.

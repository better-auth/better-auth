---
"better-auth": patch
---

Device session cookies whose sessions were deleted or expired no longer count toward the maximum number of sessions. They are cleared on the next sign-in, so a stale cookie can no longer silently prevent new devices from being saved.

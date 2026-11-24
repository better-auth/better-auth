---
"better-auth": patch
---

Unsigned or tampered device session cookies, and cookies whose sessions were deleted, expired, or left behind by impersonation, no longer count toward the maximum number of sessions. They are cleared on the next sign-in, so a stale cookie can no longer silently prevent new devices from being saved. Only device cookies belonging to the current auth instance are cleared.

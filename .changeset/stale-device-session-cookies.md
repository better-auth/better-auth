---
"better-auth": patch
---

Device session cookies whose sessions were deleted, expired, or left behind by impersonation no longer count toward the maximum number of sessions. They are cleared on the next sign-in, so a stale cookie can no longer silently prevent new devices from being saved. Only this instance's cookies are considered, duplicate variants of one session count once, and cookies belonging to another app are left untouched.

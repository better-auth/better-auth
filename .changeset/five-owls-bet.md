---
"better-auth": minor
---

When admins change a user’s password with admin.setUserPassword, that user’s active sessions are now revoked by default. You can optionally disable this if you want to keep existing sessions active.

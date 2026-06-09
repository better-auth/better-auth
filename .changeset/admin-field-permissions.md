---
"better-auth": patch
---

The admin plugin's `createUser` and `updateUser` now require `user:set-role` to assign a role and `user:ban` to set ban state (`banned`, `banReason`, `banExpires`) through the `data` payload, matching `setRole` and `banUser`. Admins without those permissions now receive a 403 from these endpoints when they include those fields. Server-side `auth.api` calls and admins that hold the permissions are unaffected.

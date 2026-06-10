---
"better-auth": patch
---

Guard protected user fields in the admin plugin behind their dedicated permissions. `/admin/create-user` now requires `user:set-role` when a `role` is supplied (top-level or via `data.role`), validates requested roles against the configured roles, requires `user:ban` for ban fields passed in `data`, and no longer lets `data` override `email`, `name`, or `role`. `/admin/update-user` now requires `user:ban` for `banned`/`banReason`/`banExpires` (revoking the user's sessions when banning and rejecting self-bans), requires the new `user:set-email` permission for `email`/`emailVerified` (with email validation, lowercasing, and uniqueness checks), and rejects `password` updates in favor of `/admin/set-user-password`. If you use a custom access control, add `set-email` to your statements and grant it (and `ban`) to roles that should be able to change those fields through `update-user`.

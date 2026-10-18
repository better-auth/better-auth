---
"@better-auth/core": patch
"better-auth": patch
---

Secondary-storage session eviction no longer fails open. `deleteUserSessions` and `deleteUser` now reject when a session could not be removed from secondary storage instead of logging the failure and reporting a successful revocation.

- Eviction runs after the surrounding database work commits across all adapters, and callers receive rejection errors while committed database state stands (e.g. `POST /change-password`, `POST /reset-password`, `POST /delete-user`, `POST /admin/remove-user`, and `POST /admin/ban-user`).
- Eviction executes after other queued after-commit hooks and sequentially attempts removal for every listed session.
- Sessions that fail eviction remain listed in the active-sessions index so subsequent revocation attempts retry them.

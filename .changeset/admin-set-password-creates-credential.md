---
"better-auth": patch
---

`admin.setUserPassword` now creates a credential account when the target user does not have one, matching the behavior of `resetPassword`. Previously the call returned `status: true` without doing anything for users without an existing credential account (e.g., social-only or magic-link signups), so admins migrating users from another auth system or assigning an initial password to a social-only user can now do so directly without poking the `account` table.

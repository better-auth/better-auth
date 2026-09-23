---
"better-auth": patch
---

Passwords longer than `maxPasswordLength` are now rejected with `PASSWORD_TOO_LONG` before hashing on sign-in (email, username, phone number), verify-password, change-password (`currentPassword`), delete-user, the two-factor endpoints that take a password, and admin create-user, matching what sign-up and password reset already did.

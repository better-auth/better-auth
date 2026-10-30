---
"better-auth": patch
---

Fixed sign-up verification email not being sent when using database transactions with a background task handler. The email is now queued to run after the transaction commits, matching the existing OAuth sign-up behavior.

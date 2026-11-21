---
"better-auth": patch
---

Do not consume `/delete-user/callback` verification token before verifying that it belongs to the signed-in user, keeping the owner's deletion link usable if opened with a different active session.

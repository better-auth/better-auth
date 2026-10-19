---
"better-auth": patch
---

Fix `magic-link` verify redirecting to `errorCallbackURL` when a `session.create.before` hook rejects with an `APIError` (e.g. the admin plugin's `BANNED_USER`), instead of letting the raw error response escape the auth server.

---
"better-auth": patch
---

Clear a previously set `banExpires` when the admin plugin bans a user without `banExpiresIn`, so a permanent ban no longer keeps a stale expiration date that lets the user back in.

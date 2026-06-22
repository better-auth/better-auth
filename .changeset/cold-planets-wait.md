---
"better-auth": patch
---

Currently if the auth server has cookie cache then grabbing the session could return a stale cache value, while this is fine in most cases, in critical areas like the admin endpoints where we check for their role or ban status we must grab their session data straight from DB rather than relying on the client cache.

---
"better-auth": patch
---

Allow direct `auth.api.getSession()` calls without request headers to return `null` instead of throwing when no session cookies are available, including custom-session responses.

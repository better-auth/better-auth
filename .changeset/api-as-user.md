---
"better-auth": minor
---

Add a server-only `auth.api.$asUser(userId)` so trusted code can call endpoints as that user without request headers. Permission checks still run, and HTTP requests cannot use it.

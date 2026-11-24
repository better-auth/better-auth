---
"better-auth": patch
---

Organization dynamic role names are now trimmed when created or renamed, and names that are empty or contain a comma are rejected with `INVALID_ROLE_NAME`.

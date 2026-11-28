---
"@better-auth/electron": patch
---

Fixed an extra `/get-session` request in the main process each time a session read renewed the cookie cache.

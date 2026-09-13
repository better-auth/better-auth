---
"better-auth": patch
---

Fix `customSession()` leaving stale session cookies in the browser. When the session is expired or no longer exists, `get-session` now expires the `session_token` / `session_data` cookies as it does without the plugin, instead of returning `null` with no `Set-Cookie` headers.

---
"better-auth": patch
---

Fix the phone number plugin answering `/update-user` with a 500 when the request has no body. It now gets the same 400 as without the plugin.

---
"better-auth": patch
---

Fix `deferSessionRefresh` session refresh getting rejected with a 415 on Node/Next.js/Nuxt, where a bodyless `POST /get-session` is sent as a non-null empty stream with no content-type header. The client now sends a JSON body on the refresh request, and the `/get-session` endpoint no longer parses the request body since it never reads it.

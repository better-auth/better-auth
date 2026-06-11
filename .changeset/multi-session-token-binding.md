---
"better-auth": patch
---

The multi-session `set-active` and `revoke` endpoints now act only on the session the caller holds a signed cookie for. A request could previously activate or revoke a different session by naming its token in the request body without holding that session's cookie.

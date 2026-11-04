---
"better-auth": patch
---

Denying a device authorization request now rejects a session that was revoked but still present in the cookie cache, matching the behavior of approving a request.

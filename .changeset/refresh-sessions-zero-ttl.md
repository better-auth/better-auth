---
"better-auth": patch
---

Fixed cached sessions in secondary storage being stored without an expiry when a user update refreshed a session with less than a second left.

---
"better-auth": patch
---

Opening a delete-account link while signed in as a different user no longer consumes the token. The owner's link keeps working until they use it or it expires. Previously the token was burned before the owner check, so the owner had to request a new link.

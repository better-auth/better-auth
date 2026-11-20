---
"better-auth": patch
---

Fix email OTP sign-in and magic link verification returning a 500 when another request creates the same user between the lookup and the insert. The request now signs in that user instead of using up the code or link without a session.

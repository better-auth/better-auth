---
"better-auth": patch
---

Fix email OTP sign-in and magic link verification returning a 500 when the user is created by another request between the lookup and the insert. The request now signs in the existing user.

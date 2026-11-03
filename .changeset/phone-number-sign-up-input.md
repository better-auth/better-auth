---
"better-auth": patch
---

With the phone number plugin, a new user no longer stores a `phoneNumber` that was not verified. Sign-up and sign-in routes reject one sent in the request, and a number from a social profile or in `data` passed to `createUser` is dropped unless it is marked verified.

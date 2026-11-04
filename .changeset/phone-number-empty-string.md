---
"better-auth": patch
---

Signing up with an empty `phoneNumber` with the phone number plugin no longer stores the empty string or makes later sign-ups fail. Linking an account whose profile maps an empty phone number no longer replaces the user's verified number.

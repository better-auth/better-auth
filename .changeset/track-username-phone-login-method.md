---
"better-auth": patch
---

Record username and phone number sign-ins in the last-login-method plugin. `/sign-in/username` is stored as `username` and `/sign-in/phone-number` as `phone-number`, in the cookie and in the database when `storeInDatabase` is on.

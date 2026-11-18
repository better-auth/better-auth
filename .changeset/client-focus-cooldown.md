---
"better-auth": patch
---

Fixed focus and reconnect refetches firing right after a successful session fetch, such as on page load or after sign-in, and starting a second request while one is pending.

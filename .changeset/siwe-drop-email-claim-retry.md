---
"better-auth": patch
---

Changed SIWE sign-in to fail instead of retrying with the wallet email when another sign-up takes the requested email during the request. Signing in again uses the wallet email.

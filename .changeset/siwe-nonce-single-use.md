---
"better-auth": patch
---

The Sign-In with Ethereum nonce is now consumed atomically before signature verification, so the same nonce can no longer replay a sign-in under concurrent requests.

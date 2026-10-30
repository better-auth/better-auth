---
"better-auth": minor
---

The `phone-number` plugin now accepts a `storeOTP` option, so verification codes can be stored hashed or encrypted instead of in plain text. Attempt limiting keeps working with hashed and encrypted codes, and the default behavior is unchanged.

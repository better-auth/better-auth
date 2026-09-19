---
"better-auth": patch
---

Harden Google One Tap against ID-token replay. The client now obtains a short-lived, server-issued nonce before Google initializes, and the callback verifies that nonce against a signed browser state before consuming the attempt. Button-mode attempts are refreshed after use and shortly before expiry. Caller-provided `nonce` values are ignored; remove them from `oneTap()` and `additionalOptions`.

---
"better-auth": patch
---

Harden Google One Tap against ID-token replay. The client now obtains a short-lived, server-issued nonce before Google initializes, and the callback verifies that nonce against a signed browser state before consuming the attempt. Button-mode attempts are refreshed after use and shortly before expiry, and a failed refresh is retried with backoff so the button cannot be stranded on a spent nonce. A browser may hold a few attempts at once, so several rendered buttons — and a refresh that lands between a click and its callback — no longer invalidate each other. Caller-provided `nonce` values are ignored; remove them from `oneTap()` and `additionalOptions`.

---
"better-auth": patch
---

Fixed `ReferenceError: window is not defined` when a client session subscription is cleaned up after a test environment such as happy-dom tears down its globals.

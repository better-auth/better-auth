---
"better-auth": patch
---

Allow `customSession` callbacks to return `null` so hooks can invalidate or omit a session while preserving expired session cookies on `getSession` and filtering `null` entries from `listDeviceSessions`.

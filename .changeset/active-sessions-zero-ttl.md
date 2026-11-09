---
"better-auth": patch
---

Fixed the `active-sessions` list in secondary storage being stored without an expiry when the last remaining session had less than a second left.

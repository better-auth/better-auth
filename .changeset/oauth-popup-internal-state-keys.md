---
"better-auth": patch
---

The `oauth-popup` plugin now ignores internal OAuth state fields passed through its `additionalData` parameter, so `additionalData` only ever carries your own custom values.

---
"better-auth": patch
---

Fixes an issue where `useSession({ throw: true })` incorrectly excluded `null` from its `data` type.

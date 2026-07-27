---
"better-auth": patch
---

Fix `jwtClient()` collapsing `createAuthClient` type inference when combined with other client plugins such as `inferAdditionalFields`. Additional user fields (for example on `updateUser`) are preserved again.

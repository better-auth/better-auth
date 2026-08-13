---
"@better-auth/expo": patch
---

Fix `expoClient()` collapsing `createAuthClient` type inference when combined with other client plugins. The `getCookie` action is available on the client again.

---
"better-auth": patch
---

Require `/refresh-token` to only trust the account cookie when its `userId`, `providerId` and (when supplied) `accountId` match the resolved session user.
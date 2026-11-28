---
"auth": patch
---

`auth generate` now gives a missing Prisma back-relation the same `@relation` name as its foreign-key side, and stops with an error when it cannot add one that Prisma would accept.

---
"auth": patch
---

`auth generate` for Prisma no longer adds a second back-relation when the model already has one under another name, which made Prisma reject the schema as an ambiguous relation.

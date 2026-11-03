---
"better-auth": patch
---

Organization invitations use random IDs when `advanced.database.generateId` is not set, including on adapters with sequential default IDs such as MongoDB. On MongoDB, new invitation IDs are strings instead of ObjectIds.

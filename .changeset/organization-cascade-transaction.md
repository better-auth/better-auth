---
"better-auth": patch
---

`deleteOrganization` and `removeMember` cascades now run inside a transaction so a mid-cascade failure rolls back instead of leaving orphan rows.

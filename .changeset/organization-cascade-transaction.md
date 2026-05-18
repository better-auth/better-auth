---
"better-auth": patch
---

`deleteOrganization` and `removeMember` now roll back instead of leaving orphan rows when a step fails.

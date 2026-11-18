---
"better-auth": patch
---

Auth calls such as `organization.setActive()` now resolve once plugin hooks such as `useActiveOrganization()` reflect the change.

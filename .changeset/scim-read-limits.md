---
"@better-auth/scim": patch
---

SCIM Groups with more than 100 members are now created, replaced, patched and deleted in full. Previously a Group `POST` with more than 100 members returned `400 Bad Request`, and `PUT`, `PATCH` and `DELETE` could leave members or mapped roles behind. Role mapping also no longer drops roles for Users who are in several Groups, and `listSCIMManagedConnections` now returns every connection of a provisioning domain instead of the first 100.

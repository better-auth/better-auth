---
"@better-auth/scim": patch
---

SCIM Groups with more than 100 members are now created, replaced, patched and deleted in full. Previously, a Group `POST` with more than 100 members returned `400 Bad Request` ("One or more Group members are invalid"), and `PUT`, `PATCH` and `DELETE` could leave members or mapped roles behind. With role mapping, Users who are in several Groups now get every mapped role, and deleting a User updates every Group they were in. Managed connections now list every connection of a provisioning domain and every credential of a connection, instead of the first 100. Setups where every Group, User and provisioning domain stays under 100 rows see no change, and no action is needed.

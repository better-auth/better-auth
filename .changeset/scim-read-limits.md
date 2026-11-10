---
"@better-auth/scim": patch
---

SCIM Groups with more than 100 members are now created, replaced, patched and deleted in full. Previously, a Group `POST` with more than 100 members returned `400 Bad Request` ("One or more Group members are invalid"), and `PUT`, `PATCH` and `DELETE` could leave members or mapped roles behind.

With role mapping, Users now get every mapped role when a Group write updates many Users who are also in other Groups (for example, 50 Users who each belong to three Groups), and deleting a User updates every Group they were in. Previously, some of those Users got no grant from the new Group.

`listSCIMManagedConnections` now returns every connection of a provisioning domain, and `getSCIMManagedConnection`, `revokeSCIMManagedCredential` and `decommissionSCIMManagedConnection` return every credential of a connection, instead of the first 100.

If you use a custom database adapter, check that it accepts a `limit` of up to 2,147,483,647 on `findMany`: these SCIM reads now pass that value when they must return every row.

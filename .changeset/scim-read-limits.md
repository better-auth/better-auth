---
"@better-auth/scim": patch
---

SCIM Groups with more than 100 members now sync in full (affected v1.7.0 to v1.7.20). Before, a Group `POST` with more than 100 members returned `400`, and `PUT`, `PATCH` and `DELETE` could leave members or mapped roles behind. Role mapping no longer skips Users who are in several Groups, and the managed connection endpoints return every connection and credential instead of the first 100. No action is needed.

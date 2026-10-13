---
"@better-auth/scim": patch
---

SCIM directories that send concurrent updates now get a `409` uniqueness error when a User `PATCH`, Group `PUT`, or Group `PATCH` claims a `userName`, `displayName`, `externalId`, or managed email that another request saved first. Previously the losing request failed with a `500` server error. Requests that don't race are unaffected.

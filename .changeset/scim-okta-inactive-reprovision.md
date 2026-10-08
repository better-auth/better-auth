---
"@better-auth/scim": patch
---

Fix `POST /scim/v2/Users` rejecting a reprovisioned user with a uniqueness conflict when an inactive SCIM User already has the same `externalId`, such as when Okta reassigns a deactivated user. The inactive SCIM User is now reprovisioned in place and keeps its ID and linked Better Auth User.

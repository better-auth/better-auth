---
"@better-auth/scim": patch
---

Restore an inactive SCIM User when `POST /scim/v2/Users` reuses the same connection-scoped `externalId`, so Okta-style deprovision and reassignment no longer fails with a uniqueness conflict.

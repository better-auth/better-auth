---
"@better-auth/scim": minor
---

Add `acquireActiveSCIMUserLink` for transaction-safe authentication of provisioned users. The helper maps an exact SCIM connection ID and `externalId` to an active Better Auth User while fencing concurrent deactivation, deletion, and connection decommissioning.

Compose the helper with SSO `resolveUser` to link the provisioned User without matching by email or `userName`.

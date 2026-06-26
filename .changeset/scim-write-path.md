---
"@better-auth/scim": patch
---

Tighten the SCIM user write path and honor the `active` attribute.

A non-organization SCIM `DELETE` now unlinks the provider's own account when the user has other linked identities, and deletes the global user only when the SCIM account is their sole identity. `PUT` and `PATCH` reject changing a user's email to one already used by another user with a `409` conflict, and clear `emailVerified` when the email changes.

The SCIM `active` attribute is honored on create, update, and patch. `active: false` deactivates the user through the admin plugin's banned state and revokes their sessions; `active: true` reactivates. The user resource reports the real state instead of always reporting active. Honoring `active` requires the admin plugin.

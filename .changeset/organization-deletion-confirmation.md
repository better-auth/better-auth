---
"better-auth": minor
---

feat(organization): add email confirmation and password verification for organization deletion

Adds two new optional safety mechanisms to the `deleteOrganization` endpoint in the organization plugin:

- **Email confirmation flow**: when `requireEmailConfirmation` is enabled, an email with a confirmation token is sent to the owner before the organization is deleted. A new `confirmDeleteOrganization` endpoint handles token verification and executes the deletion.
- **Password verification**: when `requirePassword` is enabled, the owner must supply their current password before the organization can be deleted.

Both options are opt-in and do not affect existing behavior when left unconfigured.

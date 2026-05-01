---
"better-auth": minor
---

Organization deletion now supports two optional safety mechanisms:

- **Email confirmation**: configure `sendDeleteOrganizationEmail` to send the owner a confirmation link before the organization is deleted. The owner must click the link (or supply the token programmatically) to complete the deletion.
- **Password requirement**: set `requirePasswordToDeleteOrganization: true` to require the owner to provide their current password before the organization can be deleted.

Both options are opt-in and do not affect existing behavior when left at their defaults.

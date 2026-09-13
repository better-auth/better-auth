---
"better-auth": minor
---

Added an opt-in passwordless enrollment primitive: `user.enrollment` plus `POST /enroll` and `POST /enroll/callback` let an app prove ownership of an email first and only then let the user set a password, instead of accepting a password up front. `admin.createUser` gets a new `sendEnrollmentEmail` option for passwordless admin-created users, and the organization plugin sends a single enrollment email (with a new unauthenticated `organization.getInvitationPreview` endpoint) instead of the normal invitation email when inviting an email with no verified account yet, accepting the invitation automatically once enrollment completes. Everything is opt-in and backward compatible.

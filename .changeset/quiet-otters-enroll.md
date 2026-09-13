---
"better-auth": minor
---

Added an opt-in passwordless enrollment primitive: `user.enrollment` plus `authClient.enroll` (`POST /enroll`) and `authClient.enroll.callback` (`POST /enroll/callback`) let an app prove ownership of an email first and only then let the user set a password, instead of accepting a password up front. A name is required to complete self-service enrollment, given at either step. `admin.createUser` gets a new `sendEnrollmentEmail` option for passwordless admin-created users, and the organization plugin sends a single enrollment email (with a new unauthenticated `organization.getInvitationPreview` endpoint) instead of the normal invitation email when inviting an email with no verified account yet, accepting the invitation automatically once enrollment completes -- no name required in that case, since the inviter never collects one. Everything is opt-in and backward compatible.

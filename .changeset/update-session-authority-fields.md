---
"better-auth": patch
---

Passing `activeOrganizationId`, `activeTeamId`, or `impersonatedBy` to `/update-session` now returns a 400. Change these plugin-managed session fields through their dedicated endpoints instead, such as `organization.setActive`.

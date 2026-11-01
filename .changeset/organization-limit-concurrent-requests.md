---
"better-auth": patch
---

Serialize organization creation per-user, serialize member additions and invitation accepts per-organization, and wrap organization, member, and default team creation inside a database transaction to prevent exceeding `organizationLimit` and `membershipLimit` under concurrent requests and avoid leaving orphaned organizations on member creation failure.

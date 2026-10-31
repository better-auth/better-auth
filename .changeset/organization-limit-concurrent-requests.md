---
"better-auth": patch
---

Serialize organization creation per-user and wrap organization, member, and default team creation inside a database transaction to prevent exceeding `organizationLimit` under concurrent requests and avoid leaving orphaned organizations on member creation failure.

---
"@better-auth/sso": patch
---

Accept `member.role` as either a comma-separated string or `string[]` in SSO org-admin checks, so Postgres `text[]` role columns no longer crash `hasOrgAdminRole`.

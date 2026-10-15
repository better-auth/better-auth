---
"@better-auth/scim": patch
---

SCIM no longer throws while auth is starting when the database adapter has no native transactions. `/scim/v2` routes, including reads, return 501, and SCIM management writes return 501. Management reads stay available.

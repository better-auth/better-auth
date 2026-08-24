---
"@better-auth/scim": minor
---

Add pagination to `listSCIMManagedConnectionEvents`. The endpoint now accepts optional `limit`, `offset`, and `sortDirection` body fields, defaults to 10 events starting at offset 0 sorted by sequence newest first, and returns `total` alongside the pagination metadata.

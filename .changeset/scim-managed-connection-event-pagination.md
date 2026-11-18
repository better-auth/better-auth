---
"@better-auth/scim": patch
---

Add pagination to `listSCIMManagedConnectionEvents`. The endpoint now accepts optional `limit`, `offset`, and `sortDirection` body fields and returns `total` with the page. Calls that omit those fields still return the latest 100 events in ascending sequence order.

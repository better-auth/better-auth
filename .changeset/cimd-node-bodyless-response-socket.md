---
"@better-auth/cimd": patch
---

`@better-auth/cimd/node` now closes the connection after a response without a body, such as `304 Not Modified` to a metadata revalidation. Previously the connection stayed open for as long as the metadata server kept it open.

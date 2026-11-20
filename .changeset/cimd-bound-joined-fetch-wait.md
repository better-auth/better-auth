---
"@better-auth/cimd": patch
---

A request that joins a Client ID Metadata Document fetch that never settles, as when a runtime ends the request that started it, now stops waiting after 10 seconds and fetches the document itself. Before, it waited forever, and every later request for that client waited with it.

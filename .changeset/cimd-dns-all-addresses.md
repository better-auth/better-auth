---
"@better-auth/cimd": patch
---

Node CIMD metadata fetches now succeed when the first DNS answer is unreachable, for example when the host has no outbound IPv6. The transport returns every validated address to Node's address-family fallback instead of only the first, and it still queries DNS once and rejects the request when any answer is not publicly routable.

---
"@better-auth/cimd": patch
---

Fixed client ID metadata fetches for a `client_id` URL whose host is a public IPv6 literal, such as `https://[2606:2800:220:1:248:1893:25c8:1946]/client.json`, which always failed with a DNS lookup error. The literal is now classified directly, pinned for the connection, and still rejected when it is not publicly routable.

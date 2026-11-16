---
"@better-auth/core": patch
---

The shared host classifier now treats every IPv6 address in `0000::/8` as reserved, except `::`, `::1`, and unmapped IPv4-mapped addresses. Before, `isPublicRoutableHost` accepted IPv4-translated forms such as `::ffff:0:7f00:1` and `::5efe:7f00:1`, even when the IPv4 address they embed is loopback or private.

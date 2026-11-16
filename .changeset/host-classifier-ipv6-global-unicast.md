---
"@better-auth/core": patch
---

The shared host classifier now treats an IPv6 address as public only inside global unicast `2000::/3`. Addresses elsewhere, such as `100:0:0:1::1`, `4000::1`, `8000::1`, and IPv4-translated forms like `::ffff:0:7f00:1`, now classify as reserved, so `isPublicRoutableHost` rejects them. Loopback, unspecified, link-local, unique local, multicast, and IPv4-mapped addresses keep their existing kinds.

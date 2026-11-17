---
"@better-auth/core": patch
---

The shared host classifier now treats an IPv6 address as public only inside global unicast `2000::/3`. Addresses inside `2000::/3` keep their class. Addresses outside it that used to classify as public, such as `200::1`, `4000::1`, `8000::1`, `100:0:0:1::1`, and the IPv4-translated `::ffff:0:7f00:1`, now classify as reserved, so `isPublicRoutableHost` rejects them. Loopback, unspecified, link-local, unique local, multicast, and IPv4-mapped addresses keep their existing kinds.

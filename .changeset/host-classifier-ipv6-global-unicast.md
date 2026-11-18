---
"@better-auth/core": patch
---

The shared host classifier now treats an IPv6 address as public only inside global unicast `2000::/3`, with the exception of the well-known NAT64 block `64:ff9b::/96`, which is public when the IPv4 address it embeds is public. Addresses inside `2000::/3` keep their class. Addresses outside both that used to classify as public, such as `200::1`, `4000::1`, `8000::1`, `100:0:0:1::1`, and the IPv4-translated `::ffff:0:7f00:1`, now classify as reserved, so `isPublicRoutableHost` rejects them. Loopback, unspecified, link-local, unique local, multicast, and IPv4-mapped addresses keep their existing kinds.

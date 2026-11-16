---
"@better-auth/core": patch
---

The shared host classifier now treats an IPv6 address as public only inside global unicast `2000::/3`. Addresses elsewhere, such as `100:0:0:1::1`, `4000::1`, `8000::1`, and IPv4-translated forms like `::ffff:0:7f00:1`, now classify as reserved, so `isPublicRoutableHost` rejects them. Loopback, unspecified, link-local, unique local, multicast, and IPv4-mapped addresses keep their existing kinds.

A well-known NAT64 address (`64:ff9b::/96`) now takes the class of the IPv4 address it embeds, as 6to4 already did. It was always reserved, so on networks with a DNS64 resolver, names with only an A record failed the outbound checks. A NAT64 address that embeds a loopback, private, or other non-public IPv4 is still rejected.

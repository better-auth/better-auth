---
"@better-auth/core": patch
---

The shared host classifier now treats IPv4-translated IPv6 addresses (`::ffff:0:0:0/96`, RFC 2765) as reserved. Before, `isPublicRoutableHost` accepted such an address even when the IPv4 address it embeds is loopback or private, while it already rejected the IPv4-mapped and NAT64 forms.

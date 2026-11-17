---
"@better-auth/core": patch
---

The shared host classifier now treats a well-known NAT64 address (`64:ff9b::/96`) as public when the IPv4 address it embeds is public, and as reserved otherwise, as it already does for 6to4. Addresses in this block were always reserved, so on a network with a DNS64 resolver, names with only an A record failed the outbound checks in SSO discovery, CIMD metadata fetches, and client registration. A NAT64 address that embeds a loopback, private, or other non-public IPv4 is still rejected.

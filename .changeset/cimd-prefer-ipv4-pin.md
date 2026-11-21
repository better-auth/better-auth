---
"@better-auth/cimd": patch
---

The Node metadata transport now pins an IPv4 address when the host resolves to both IPv4 and IPv6, so fetches no longer fail on hosts without IPv6 egress. Every resolved address is still required to be public-routable.

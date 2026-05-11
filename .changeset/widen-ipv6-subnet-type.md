---
"@better-auth/core": patch
---

Widen `advanced.ipAddress.ipv6Subnet` to accept any integer prefix length from 0 to 128, not just `32 | 48 | 64 | 128`. The runtime mask code already handled any value in range; the type union was unnecessarily narrow and rejected valid prefix lengths like `/56` (residential ISP allocations) and `/40` (common cloud allocations). Existing values continue to work unchanged.

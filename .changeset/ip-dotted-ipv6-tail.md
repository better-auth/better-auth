---
"@better-auth/core": patch
---

IPv6 addresses with a dotted IPv4 tail, such as `::ffff:808:127.0.0.1`, are no longer misread as IPv4-mapped. The host classifier now rejects them as reserved, and IP normalization and CIDR matching expand the tail into two hex groups.

---
"better-auth": patch
---

Fix ReDoS vulnerability in `validateProxyHeader` hostname regex (issue #8898).

The previous single combined regex for hostname validation used nested quantifiers
(`([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?` repeated by an outer `(...)*` group) that
cause catastrophic backtracking in NFA-based regex engines on crafted
`x-forwarded-host` values, allowing CPU exhaustion.

The fix replaces the combined regex with a per-label approach: the host is split
on `.` and each label is validated independently with an anchored, linear-time
regex `/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/`. This eliminates
cross-label backtracking entirely while preserving the original accept/reject
semantics.

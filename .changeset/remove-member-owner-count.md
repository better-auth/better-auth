---
"better-auth": patch
---

Removing an organization owner no longer fails when the organization has more than 100 members and the other owners sit past the first 100, and no longer exceeds the bound-parameter limit on databases such as Cloudflare D1.

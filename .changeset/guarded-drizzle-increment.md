---
"@better-auth/drizzle-adapter": patch
---

Repeat the `where` guard on the `UPDATE` in `incrementOne`, in both the default adapter and `relations-v2`, so concurrent compare-and-swap calls cannot all succeed on PostgreSQL. The guard lived only in the id-selecting subquery, which PostgreSQL does not re-evaluate after waiting on a concurrent writer; the database rate limiter let bursts past `max`, a two-factor backup code could be accepted more than once, and two callers could both claim one organization invitation.

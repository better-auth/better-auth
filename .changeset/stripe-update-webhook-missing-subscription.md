---
"@better-auth/stripe": patch
---

A `customer.subscription.updated` webhook for a customer with no local subscription now logs a clear warning instead of failing with a `TypeError`.

---
"@better-auth/stripe": patch
---

When several records share a Stripe customer id, subscriptions created outside checkout now go to the owner recorded on the Stripe customer, and are skipped with a warning when no recorded owner holds the id.

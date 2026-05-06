---
"@better-auth/stripe": patch
---

Returning a custom `subscription_data` from `getCheckoutSessionParams` no longer hides the plan's free trial in Stripe Checkout or creates duplicate local subscription rows when the `customer.subscription.created` webhook fires.

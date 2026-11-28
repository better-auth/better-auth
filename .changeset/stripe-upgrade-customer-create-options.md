---
"@better-auth/stripe": patch
---

A Stripe customer created for a user during `subscription.upgrade` now uses `getCustomerCreateParams`, calls `onCustomerCreate`, and saves `stripeCustomerId` through user update database hooks, the same as a customer created on sign-up. Before, upgrading without an existing customer skipped all three.

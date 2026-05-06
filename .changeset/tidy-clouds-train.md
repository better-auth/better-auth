---
"@better-auth/stripe": patch
---

`onSubscriptionUpdate` now receives `stripeSubscription` (the raw Stripe object), matching the shape of all other subscription callbacks. `onSubscriptionCancel` now also receives the post-update subscription row instead of the pre-update snapshot.

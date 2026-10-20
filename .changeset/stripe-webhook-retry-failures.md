---
"@better-auth/stripe": patch
---

Stripe webhooks now return an error when saving a subscription change or running a lifecycle hook fails, so Stripe retries the event. A retried `customer.subscription.created` for a subscription that already has a row now applies the event as an update instead of skipping it.

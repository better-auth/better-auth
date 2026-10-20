---
"@better-auth/stripe": patch
---

Stripe webhooks now return an error when saving a subscription change or running a lifecycle hook fails, so Stripe retries the event. Retried deliveries re-run the hooks that failed, and a `customer.subscription.created` for a subscription that already has a row applies Stripe's current subscription state instead of being skipped.

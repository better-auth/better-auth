---
"@better-auth/stripe": patch
---

`customer.subscription.created` and `customer.subscription.updated` webhooks now refetch the subscription from Stripe, so billing periods are stored correctly when the webhook endpoint uses an older API version than the Stripe SDK. If the refetch fails, the webhook returns an error so Stripe retries it.

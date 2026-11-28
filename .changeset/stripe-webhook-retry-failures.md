---
"@better-auth/stripe": patch
---

Stripe webhooks now return an error when saving a subscription change or running a lifecycle hook fails, so Stripe retries the event. Retried deliveries re-run the hooks that failed, including `onSubscriptionCreated` for subscriptions created outside checkout.

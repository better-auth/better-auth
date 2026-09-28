---
"@better-auth/stripe": patch
---

Return a non-2xx response from the Stripe webhook when a subscription change can't be saved, so Stripe retries the event instead of the subscription silently going stale. Stripe API errors that a retry can't fix, such as a subscription deleted in Stripe before the event arrived, are logged and acknowledged instead of retried. Errors thrown by subscription lifecycle hooks such as `onSubscriptionComplete` are still logged without failing the webhook, and no longer stop the hooks that run after them.

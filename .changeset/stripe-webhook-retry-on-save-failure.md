---
"@better-auth/stripe": patch
---

Return a non-2xx response from the Stripe webhook when a subscription change can't be saved, so Stripe retries the event instead of the subscription silently going stale. Errors thrown by subscription lifecycle hooks such as `onSubscriptionComplete` are still logged without failing the webhook, and no longer stop the hooks that run after them.

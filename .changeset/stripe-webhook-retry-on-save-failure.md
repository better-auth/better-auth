---
"@better-auth/stripe": patch
---

Return a non-2xx response from the Stripe webhook when a subscription change can't be saved, so Stripe retries the event instead of the subscription silently going stale. Stripe API requests that Stripe rejects as invalid are logged and acknowledged instead of retried. Stripe API errors with status 401, 403, 404, 409 or 429 are still retried, since they usually point to an account or key setup problem you can fix. Errors thrown by subscription lifecycle hooks such as `onSubscriptionComplete` are still logged without failing the webhook, and no longer stop the hooks that run after them.

---
"@better-auth/stripe": minor
---

The `onSubscriptionCancel` callback's `event` parameter is now required, consistent with the other subscription lifecycle callbacks. Update your callback to declare `event` as a required parameter and remove any `undefined` guards around it.

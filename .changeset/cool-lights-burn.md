---
"@better-auth/stripe": minor
---

`onSubscriptionCancel` callback `event` is no longer marked optional, consistent with all other subscription lifecycle callbacks. The only call site always provides an event, so the optional marker was inaccurate.

---
"@better-auth/stripe": patch
---

`onSubscriptionDeleted`, `onTrialEnd`, and `onTrialExpired` now receive the post-update subscription row instead of the pre-update snapshot, consistent with the rest of the lifecycle callbacks.

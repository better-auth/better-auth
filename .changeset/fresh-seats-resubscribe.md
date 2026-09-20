---
"@better-auth/stripe": patch
---

Fix automatic seat synchronization after an organization cancels and resubscribes, so member changes update the active or trialing subscription even when canceled subscriptions remain in its history.

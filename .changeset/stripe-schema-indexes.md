---
"@better-auth/stripe": patch
---

Add database indexes to frequently queried Stripe lookup fields (`subscription.referenceId`, `subscription.stripeCustomerId`, `subscription.stripeSubscriptionId`, `user.stripeCustomerId`, and `organization.stripeCustomerId`) to prevent full-table scans.

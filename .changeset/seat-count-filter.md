---
"@better-auth/stripe": minor
---

Added `organization.countActiveMembers` to the Stripe plugin. This callback lets you customize how members are counted for auto-managed organization subscription seats, so soft-deleted, suspended, or otherwise inactive members can be excluded from Stripe seat counts.

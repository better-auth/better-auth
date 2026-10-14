---
"@better-auth/stripe": patch
---

Prevent `TypeError: Cannot read properties of undefined (reading 'id')` in `onSubscriptionUpdated` webhook when the subscription is not found in the database.

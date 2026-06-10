---
"@better-auth/stripe": patch
---

Several fixes to Stripe subscription handling. When `createCustomerOnSignUp` is enabled, an existing Stripe customer is reused for a new user (matched by email) only when the email is verified, so signups with an unverified email now get a new customer. `/subscription/success` syncs the subscription from the checkout session rather than the customer's first active subscription. Canceling a subscription removes only the targeted subscription row instead of every row that shares the same `referenceId`, and restoring a subscription targets the requested subscription instead of the customer's first active one. `/subscription/upgrade` validates `returnUrl` against `trustedOrigins`, matching `/subscription/cancel` and the billing portal. Organization deletion checks every Stripe subscription instead of only the first 100.

---
"@better-auth/stripe": patch
---

Plans can now set `billingPortalConfiguration` to show customers a specific Stripe Billing Portal configuration (`bpc_...`) instead of the default.

For more control, the new `getBillingPortalSessionParams` subscription option customizes Billing Portal session parameters, such as choosing a configuration per customer or organization. Both apply to the billing portal endpoint and to the portal sessions created when changing plans or canceling.

---
"@better-auth/stripe": patch
---

Stripe subscription lookups now filter `active` and `trialing` status in the database instead of loading every row for a reference and filtering in memory. List, checkout, cancel, restore, billing-portal, and trial-eligibility paths no longer miss the current or past-trial subscription once canceled history exceeds the adapter `findMany` cap.

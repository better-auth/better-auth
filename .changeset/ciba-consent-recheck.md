---
"@better-auth/ciba": minor
---

A CIBA request the user approved from the link can no longer be redeemed after the user deletes or narrows the consent that approval stored. The client's poll gets `invalid_grant`, and a consent given again for the same request makes it redeemable. Requests approved with `completeCibaRequest` and requests of a client with `skip_consent` are not checked.

The `cibaRequest` model has a new `approvedViaConsent` column. Run `npx auth@latest migrate`, or `npx auth@latest generate` and apply the schema with your ORM, before you upgrade.

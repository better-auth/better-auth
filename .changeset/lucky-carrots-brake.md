---
"@better-auth/oauth-provider": patch
---

Bind authorization codes to the consent that authorized them. Revoking a consent now invalidates codes already issued under it: redeeming one fails with `invalid_grant` instead of minting tokens, so a pending code can no longer survive the revocation or inherit a later replacement grant. Codes issued without a consent record (`skipConsent` clients) are unaffected.

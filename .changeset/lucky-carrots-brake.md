---
"@better-auth/oauth-provider": patch
---

Bind authorization codes to the consent that authorized them, and to the authority that consent still grants. Revoking a consent now invalidates codes already issued under it: redeeming one fails with `invalid_grant` instead of minting tokens, so a pending code can no longer survive the revocation or inherit a later replacement grant. Narrowing a consent has the same effect for the authority it removes: because narrowing updates the row in place, a code issued beforehand can no longer be redeemed for scopes or resources the user has since revoked. Codes issued without a consent record (`skipConsent` clients) are unaffected.

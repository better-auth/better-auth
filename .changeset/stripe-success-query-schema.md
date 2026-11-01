---
"@better-auth/stripe": patch
---

`/subscription/success` now rejects non-string `callbackURL` and `checkoutSessionId` query values, such as duplicated parameters, with a 400 instead of failing with a 500.

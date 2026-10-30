---
"@better-auth/stripe": patch
---

`/subscription/success` now checks the `callbackURL` against trusted origins after replacing `{CHECKOUT_SESSION_ID}`, so a `checkoutSessionId` value can no longer redirect to an untrusted origin.

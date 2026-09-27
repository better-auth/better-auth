---
"@better-auth/stripe": patch
---

Starting a subscription checkout again before the previous one was paid now expires the previous Checkout Session, and is refused when the previous one was already paid. Both sessions used to stay payable, so a customer who completed both was billed for two Stripe subscriptions while only one was tracked.

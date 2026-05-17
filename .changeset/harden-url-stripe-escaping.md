---
"better-auth": patch
"@better-auth/stripe": patch
---

Harden URL normalization and Stripe customer search escaping. URL helpers now trim trailing slashes without a regular expression, and Stripe search query values escape backslashes before quotes.

---
"@better-auth/stripe": patch
---

`getCheckoutSessionParams` no longer overrides fields the plugin manages internally for webhook reconciliation and billing: `success_url`, `cancel_url`, `mode`, `customer`, `customer_email`, `client_reference_id`, and `line_items`. Other parameters still pass through. `locale` now prefers the request value over `getCheckoutSessionParams`.

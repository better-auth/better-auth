---
"@better-auth/stripe": patch
---

Stripe customer ids and the subscription fields the plugin manages can no longer be set from sign-up or update-user requests and are removed from their input types. This includes server calls such as `auth.api.updateUser`; write them through your database adapter instead.

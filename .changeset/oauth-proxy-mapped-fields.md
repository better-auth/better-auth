---
"better-auth": patch
---

Keep the user fields from `mapProfileToUser` when a sign-in or account link goes through `oAuthProxy`. Before, the preview server dropped them, so optional fields stayed empty, defaulted fields got their default, and required fields made the sign-up fail. Upgrade preview deployments together with production, because an older preview can fail the sign-up when a mapped string field looks like a date.

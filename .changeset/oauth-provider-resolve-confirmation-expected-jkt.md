---
"@better-auth/oauth-provider": minor
---

`provider.resolveConfirmation()` accepts an `expectedJkt` option, so an extension grant can keep a DPoP-bound token bound to the same key, as the built-in refresh and token exchange grants do. With `expectedJkt`, the request must carry a DPoP proof signed by that key, or client authentication must return a `confirmation` with the same `jkt`. Otherwise the request is rejected, as on refresh. Calls without `expectedJkt` behave as before.

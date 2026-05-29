---
"better-auth": patch
---

Fix OAuth proxy flows that failed with `state_mismatch` when production and preview use different `BETTER_AUTH_SECRET` values.

Two issues are addressed. The proxy callback's state cleanup now skips the state-cookie check, which could not be satisfied at the bounced cross-origin hop and left the verification record uncleaned. And with the cookie state strategy, the `oauth_state` cookie (encrypted with the local environment secret) is now re-encrypted with the proxy key before it is handed to production, mirroring the database strategy; previously a dedicated proxy `secret` that differed from `BETTER_AUTH_SECRET` broke cookie-strategy proxy flows because production could not decrypt the inner state.

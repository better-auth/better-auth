---
"@better-auth/sso": patch
---

Domain verification now applies only to the domains the provider held when the request started. If the provider changes while the DNS check is still running, the request returns `409` with the `SSO_PROVIDER_CHANGED` code instead of recording a result, so callers can reload the provider and retry.

---
"@better-auth/sso": patch
---

Allow `guardProviderMutation` to protect SSO provider updates and deletions on adapters without interactive transaction support, such as Cloudflare D1. The guard now evaluates a provider snapshot and the mutation is applied only if that row is unchanged; a concurrent change returns `409` with the `SSO_PROVIDER_CHANGED` code instead of rejecting both endpoints with `501`.

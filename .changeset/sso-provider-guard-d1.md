---
"@better-auth/sso": patch
---

Allow `guardProviderMutation` to protect SSO provider updates and deletions on adapters without interactive transaction support, such as Cloudflare D1. The guard now evaluates a provider snapshot and the mutation is applied only if that row is unchanged; a concurrent change returns `409` with the `SSO_PROVIDER_CHANGED` code instead of rejecting both endpoints with `501`.

Operations that depend on serializing account linking remain unavailable without native transactions: identity-boundary changes return `501` with `SSO_PROVIDER_IDENTITY_CHANGE_REQUIRES_NATIVE_TRANSACTIONS`, and deleting a provider with linked accounts returns `501` with `SSO_PROVIDER_DELETE_WITH_LINKED_ACCOUNTS_REQUIRES_NATIVE_TRANSACTIONS`.

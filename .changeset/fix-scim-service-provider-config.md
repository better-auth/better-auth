---
"@better-auth/scim": patch
---

Add RFC 7643 §5 required fields to the `ServiceProviderConfig` response: `filter.maxResults`, `bulk.maxOperations`, `bulk.maxPayloadSize`, `id`, and `meta.location`.

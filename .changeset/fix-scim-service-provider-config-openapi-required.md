---
"@better-auth/scim": patch
---

Mark the RFC-required `ServiceProviderConfig` fields as `required` in the generated OpenAPI schema (root, `bulk`, `filter`, and `meta`), so schema-validating clients actually catch a response that's missing them instead of treating the fields as optional.

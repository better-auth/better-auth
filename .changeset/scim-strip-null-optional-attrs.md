---
"@better-auth/scim": patch
---

Accept Microsoft Entra User payloads that serialize unassigned optional nested attributes as JSON `null` by stripping those properties before validation, while preserving scalar PATCH `value: null` clearing semantics.

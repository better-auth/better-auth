---
"@better-auth/core": minor
---

Hugging Face profile callbacks now accept organization arrays with optional plan information and omitted legacy enterprise flags. Profile mappings must iterate over `orgs` instead of reading it as a single organization.

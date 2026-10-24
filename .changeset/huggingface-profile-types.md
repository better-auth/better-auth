---
"@better-auth/core": minor
---

Hugging Face profile mappings must iterate over organization arrays and can read optional plan and security restrictions. Organization roles are strings; use `securityRestrictions` instead of the deprecated SSO and MFA flags.

---
"@better-auth/oauth-provider": patch
---

Existing empty resource scope allowlists continue to deny every scope after upgrading. Admin reads show these policies as `[]` and unrestricted policies as `null`. If you ran 1.8.0-beta.11, review resources with an empty list and explicitly set `allowedScopes: null` for any that should be unrestricted.

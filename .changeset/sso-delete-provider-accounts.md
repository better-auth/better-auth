---
"@better-auth/sso": patch
---

Deleting an SSO provider now also removes its linked account rows, so a re-registered `providerId` cannot inherit accounts from a previously deleted provider.

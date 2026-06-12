---
"@better-auth/oauth-provider": patch
---

Fix OAuth provider signed query verification so CDN or proxy query parameter reordering does not break signature validation. Existing signed redirects created before this patch is deployed may fail until their short expiration window elapses.

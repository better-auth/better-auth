---
"@better-auth/oauth-provider": patch
---

Defer OAuth resource seeding when Drizzle reports the oauthResource model is not in the schema yet, so `auth generate` can run before the plugin tables exist.

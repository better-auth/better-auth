---
"@better-auth/oauth-provider": patch
---

Resolve configured OAuth resources in memory during initialization without database queries. Persisted resource rows are created lazily when linked to a client or modified via the admin API.

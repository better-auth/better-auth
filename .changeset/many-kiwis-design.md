---
"@better-auth/api-key": minor
---

Add `softDelete` option to API key plugin. When enabled, deleting an API key (or expiring/exhausting one) sets `enabled: false` instead of removing the row. Configurable per `configId`.

---
"@better-auth/prisma-adapter": patch
---

With `provider: "mongodb"`, queries that look for an empty optional field now also match records where that field was never written. Before, they matched only fields explicitly stored as `null`. Better Auth leaves optional fields out of new records, so these lookups often found nothing. This could break flows such as refresh-token rotation in the OAuth provider (`invalid_grant`), device-code approval, SCIM account linking, and API key rate-limit windows. No action is needed. Other Prisma providers are unaffected.

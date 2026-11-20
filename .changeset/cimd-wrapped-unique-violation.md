---
"@better-auth/oauth-provider": patch
---

Fix concurrent first requests from the same Client ID Metadata Document client failing with a server error when the database layer wraps the unique-constraint error in `error.cause`. The losing request now reuses the client the other request registered, as it already did for unwrapped errors, and unique-violation codes from more database drivers are recognized.

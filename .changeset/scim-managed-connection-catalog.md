---
"@better-auth/scim": minor
---

Add an optional SCIM-owned connection and credential catalog. Configure `managedConnections` to let trusted server code create runtime tenant connections and issue, rotate, and revoke their bearer credentials through server-only `auth.api` methods, without a code-defined connection or an application-owned verifier.

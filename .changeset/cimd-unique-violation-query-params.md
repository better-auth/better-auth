---
"@better-auth/oauth-provider": patch
---

Fix Client ID Metadata Document registration treating a failed insert as a registration race when the query parameters in the wrapped error message contain words such as "duplicate". The original database error is now returned.

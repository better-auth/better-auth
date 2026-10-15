---
"@better-auth/oauth-provider": patch
---

If you configure `cachedTrustedClients`, attempts to update, delete, or rotate the secret of one of those clients through the client management endpoints now fail with HTTP 400 instead of 500. The response body is unchanged (`error: "invalid_client"`), so only code that branches on the status code is affected. A 500 previously made a deliberate refusal look like a server failure.

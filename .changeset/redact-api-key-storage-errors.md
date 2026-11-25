---
"@better-auth/api-key": patch
---

When the API key plugin's `customStorage` fails, the error is logged and rethrown without the keys and values it was called with, so API keys stored without hashing no longer reach application logs.

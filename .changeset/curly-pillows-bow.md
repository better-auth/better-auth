---
"@better-auth/api-key": patch
---

`verifyApiKey` rejected keys created under a non-default `configId` when the request omitted `configId`. It now validates the key against its own configuration.

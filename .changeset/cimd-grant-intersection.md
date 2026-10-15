---
"@better-auth/oauth-provider": patch
---

Client ID Metadata Document clients that declare a grant the server does not offer (such as Claude's enterprise `jwt-bearer` grant) can now register. Only documents sharing no grant with the server are refused.

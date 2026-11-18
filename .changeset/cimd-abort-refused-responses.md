---
"@better-auth/cimd": patch
"@better-auth/oauth-provider": patch
---

A Client ID Metadata Document or `jwks_uri` response that is refused before its body is read, such as an error status or a non-JSON content type, now releases its connection right away. Previously the connection stayed open for as long as the server kept sending the body.

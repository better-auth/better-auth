---
"@better-auth/cimd": patch
---

Client metadata and JWKS fetches through `@better-auth/cimd/node` now fail when the server answers with `101 Switching Protocols`. Previously the fetch never settled, even after the plugin's five-second timeout, so the OAuth request hung and its fetch slot stayed taken until the process restarted.

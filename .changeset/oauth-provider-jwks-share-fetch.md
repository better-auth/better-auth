---
"@better-auth/oauth-provider": patch
---

Concurrent `private_key_jwt` assertions for one `jwks_uri` now share a single fetch of the client's key set. Previously each assertion that needed the key set, including each one naming a key missing from the cached set, made its own request to the client's `jwks_uri`.

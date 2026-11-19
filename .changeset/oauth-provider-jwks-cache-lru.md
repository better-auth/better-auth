---
"@better-auth/oauth-provider": patch
---

A `private_key_jwt` client that keeps authenticating now keeps its cached `jwks_uri` key set when more than 500 clients' key sets are cached. Previously the key set stored first was evicted first even while in use, so that client's next assertion fetched its `jwks_uri` again and failed if the `jwks_uri` was unreachable.

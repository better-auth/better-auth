---
"@better-auth/oauth-provider": patch
---

Discovery no longer advertises endpoint URLs with a double slash when `baseURL` ends in `/`, such as `https://example.com/api/auth/`. Those URLs returned 404, so clients that followed discovery could not reach the token, introspection, revocation, or other endpoints. The client assertion audiences that `private_key_jwt` accepts now use the same single-slash endpoint URLs.

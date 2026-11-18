---
"@better-auth/oauth-provider": patch
---

A client discovery can now set `jwksStaleIfError` to keep verifying a discovered client's assertions with its cached `jwks_uri` keys when fetching them fails transiently. Within that many seconds of the last successful fetch, a key fetch that times out, fails to connect, or gets an HTTP 5xx response uses the cached keys and logs a warning. Before, cached keys were used for at most 10 minutes. Other failures still reject the assertion, and discoveries that do not set it are unchanged.

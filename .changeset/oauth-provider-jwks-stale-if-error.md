---
"@better-auth/oauth-provider": patch
---

A client discovery can now set `jwksStaleIfError` to keep verifying a discovered client's assertions with its cached `jwks_uri` keys when fetching them fails transiently. Within that many seconds of the last successful fetch, at most 24 hours, a key fetch that times out, fails to connect, or gets an HTTP 500, 502, 503, or 504 response uses the cached keys and logs a warning, and the keys are fetched again at most once a minute. Before, cached keys were used for at most 10 minutes, and they still are when the option is shorter. A key fetch that the transport refuses at a local capacity limit, such as the Node transport's DNS lookup limit, uses the cached keys only within 5 minutes of such a failure. Other failures still reject the assertion and stop the cached keys from being served this way until a fetch succeeds. Discoveries that do not set it are unchanged.

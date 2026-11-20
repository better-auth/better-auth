---
"@better-auth/cimd": patch
---

The Node transport from `@better-auth/cimd/node` now stops waiting for DNS as soon as the request's abort signal fires, so a resolver that never answers no longer holds a client metadata or JWKS fetch past the plugin's five-second timeout. A lookup the resolver has already started keeps running after the abort; at most 16 can be outstanding per process, and while 16 are, fetches to hostnames fail immediately instead of starting more. The plugin answers a metadata fetch refused this way with HTTP 429 `temporarily_unavailable`, as it does for its other fetch limits, and the client's next request fetches again without waiting out the failed-fetch backoff.

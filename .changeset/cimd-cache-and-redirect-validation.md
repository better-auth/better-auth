---
"@better-auth/cimd": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
---

Client ID Metadata Documents now follow shared-cache freshness rules and fail closed when freshness is ambiguous. The plugin prefers `s-maxage` over `max-age` and `Expires`, honors `s-maxage=0`, conditionally revalidates with ETag or Last-Modified, and treats invalid or duplicate freshness directives as immediately stale. Concurrent refreshes converge on one client-resource link instead of failing on its unique constraint.

Shared OAuth metadata validation now rejects a blank `client_name` without trimming a valid display name. Native private-use redirects require the RFC 8252 single-slash form, such as `com.example.app:/callback`. Native HTTP redirects accept only exact `localhost`, `127.0.0.1`, or `[::1]` hosts; other `127.0.0.0/8` addresses and localhost subdomains are rejected.

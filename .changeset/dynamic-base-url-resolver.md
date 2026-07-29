---
"@better-auth/core": minor
"better-auth": minor
---

Add function-based `baseURL` resolution for request-scoped auth origins. `baseURL` can now be a resolver that receives a Fetch `Request` and returns the origin for the current request, including async lookups for multi-tenant and white-label deployments.

Direct `auth.api` calls that use a function `baseURL` must pass a request or headers so Better Auth can construct the resolver input.

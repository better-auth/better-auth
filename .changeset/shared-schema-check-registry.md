---
"@better-auth/core": patch
---

Fixed the Drizzle schema check being dropped when a project resolves two copies of `@better-auth/core`, for example one per `better-call` peer version. Schema checks registered by an adapter are now visible to every copy.

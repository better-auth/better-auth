---
"@better-auth/core": patch
---

Added synchronous auth endpoint context access with `getCurrentAuthEndpointContext` and optional access with `tryGetCurrentAuthEndpointContext`. The existing `getCurrentAuthContext` and `getCurrentAuthContextAsyncLocalStorage` functions remain available as deprecated compatibility APIs.

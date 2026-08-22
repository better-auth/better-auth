---
"@better-auth/core": patch
---

Added synchronous auth endpoint context access with `getCurrentAuthEndpointContext` and optional access with `tryGetCurrentAuthEndpointContext`. The existing `getCurrentAuthContext` function remains available as a deprecated alias.

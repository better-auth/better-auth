---
"@better-auth/core": patch
---

A token refresh that a provider refuses with a 200 status and an OAuth error body, as GitHub does, now fails instead of returning the expired access token.

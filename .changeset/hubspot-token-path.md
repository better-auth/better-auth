---
"better-auth": patch
---

The HubSpot helper in `genericOAuth` now encodes the access token as a single path segment when fetching token info, so tokens containing reserved characters are no longer truncated, and it returns `null` instead of requesting `/access-tokens/undefined` when no access token is present.

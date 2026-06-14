---
"better-auth": patch
---

Add linkSocial support to oauth-proxy plugin

The oauth-proxy plugin now supports the `linkSocial` endpoint for cross-origin scenarios. When a user initiates account linking on a preview environment, the proxy correctly handles the flow by passing the `link.userId` through the encrypted payload, allowing accounts to be linked to the correct user on the preview server.

---
"@better-auth/oauth-provider": patch
---

Client assertion verification now uses the most recently cached key set when overlapping JWKS refreshes finish out of order.

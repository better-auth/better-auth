---
"@better-auth/oauth-provider": patch
---

OAuth Provider authorization-code replay now returns `invalid_grant` with a `400` token response and revokes previously issued opaque tokens from that authorization code.

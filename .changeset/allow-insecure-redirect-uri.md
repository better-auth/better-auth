---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Allow operators to opt in to HTTP redirect URIs on non-loopback hosts via `allowInsecureRedirectUri`, so self-hosted LAN and private-DNS deployments can use the OAuth provider without changing the HTTPS-only default.

---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): allow opting out of the https issuer rewrite

`validateIssuerUrl` no longer silently rewrites a configured non-loopback `http://` issuer to `https://`. The rewrite is now reported once with `logger.warn`, and a new `allowInsecureHttpIssuer` option keeps the configured issuer in discovery metadata and the RFC 9207 `iss` parameter for private-network deployments.

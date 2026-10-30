---
"@better-auth/passkey": patch
---

The expected WebAuthn origin now comes from server configuration instead of the request: the `origin` option, or the `baseURL` origin plus a frontend origin listed exactly in `trustedOrigins`. Set `origin` when `rpID` is set and a wildcard in `baseURL.allowedHosts` covers it.

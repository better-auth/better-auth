---
"better-auth": minor
"@better-auth/electron": minor
---

Harden the Electron OAuth flow and tighten custom-scheme trusted-origin matching.

The Electron sign-in flow now mandates PKCE S256. Plain PKCE is rejected: the `code_challenge_method` parameter is gone and every authorization code is verified by hashing the verifier with SHA-256. The server no longer trusts an `electron-origin` header to set the request Origin. The Electron client now sends a real `Origin` (for example `myapp:/`), so upgrade the `@better-auth/electron` client and server together and make sure your app's scheme is in `trustedOrigins`. The unused `disableOriginOverride` option is removed.

Custom-scheme entries in `trustedOrigins` now match by scheme and authority instead of string prefix. A host-less entry such as `myapp://` or `exp://` still trusts every host of that scheme, but a host-bearing entry such as `myapp://callback` matches that host exactly, so it is no longer satisfied by `myapp://callback.attacker.tld`.

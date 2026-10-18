---
"@better-auth/oauth-provider": patch
"@better-auth/core": patch
---

OAuth provider deployments served over plain HTTP on a private network, such as a LAN address, a VPN, or a private DNS name, can now accept `http` redirect URIs through the new `allowInsecureRedirectUri` option. Return `true` from it for origins you control. The same option lets web clients use `localhost` callbacks during development. Without the option, nothing changes.

If your issuer (`baseURL`, or `jwt.issuer` when set) uses `http` on a non-loopback host, discovery and the `iss` authorization response parameter now report it as configured instead of rewriting it to `https`. They now match the issuer in issued tokens, so OpenID Connect sign-ins no longer fail on the mismatch. If a proxy terminates TLS in front of Better Auth, set `baseURL` to the public `https` URL.

When an authorization request uses a registered `http` redirect URI that the HTTPS policy rejects, the error now appears on the server error page instead of being redirected to that URI.

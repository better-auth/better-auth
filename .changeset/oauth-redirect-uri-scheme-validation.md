---
"better-auth": patch
---

Validate the scheme of OAuth `redirect_uris` in the `oidc-provider` and `mcp` plugins.

Both plugins previously accepted any string as a `redirect_uri` at registration. They now reject the `javascript:`, `data:`, and `vbscript:` schemes, which are never valid OAuth redirect targets. The `@better-auth/oauth-provider` package already applied this check, so this change brings the two older plugins in line with it.

The redirect-URI scheme policy now lives in `@better-auth/core` as a single `SafeUrlSchema` and an `isSafeUrlScheme` helper, and the OAuth provider plugins share that one implementation. The client navigation helpers (`redirectPlugin`, one-tap, and two-factor) also skip navigation when the target uses one of these schemes.

The change is non-breaking. The `http`, `https`, loopback, and custom application schemes still register unchanged. Both `oidc-provider` and `mcp` are on the migration path to `@better-auth/oauth-provider`, which remains the route to its stricter HTTPS-or-loopback policy.

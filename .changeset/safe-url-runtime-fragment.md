---
"@better-auth/oauth-provider": patch
"@better-auth/core": patch
"better-auth": patch
---

Harden redirect-URI validation across the OAuth provider plugins. `isSafeUrlScheme` and `SafeUrlSchema` no longer call `URL.canParse`, which is absent on some supported runtimes and could throw or silently disable the dangerous-scheme check. They now parse with a `try`/`catch` fallback. `SafeUrlSchema` also rejects redirect URIs that contain a fragment component, per RFC 6749 §3.1.2.

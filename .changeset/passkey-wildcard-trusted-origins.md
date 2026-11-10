---
"@better-auth/passkey": patch
---

If a wildcard in `baseURL.allowedHosts` covers your passkey `rpID`, for example `rpID: "example.com"` with `allowedHosts: ["*.example.com"]`, the server now starts without a passkey `origin`. Since 1.7.16 this setup threw at startup unless `origin` listed every host, so tenants created at runtime could not use passkeys until the next deploy. The plugin still ignores the host the request names. It accepts the origin a passkey reports only when that exact origin is trusted: an exact `allowedHosts` entry, the `fallback`, or an origin listed exactly in `trustedOrigins`. Wildcard entries do not count. To admit tenant hosts at runtime, return their origins from a `trustedOrigins` function that checks your own tenant records. If you set `origin`, or no wildcard covers your `rpID`, nothing changes for you.

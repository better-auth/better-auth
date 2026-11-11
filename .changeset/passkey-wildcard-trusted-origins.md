---
"@better-auth/passkey": patch
---

If a wildcard in `baseURL.allowedHosts` covers your passkey `rpID`, such as `rpID: "example.com"` with `allowedHosts: ["*.example.com"]`, your server now starts without a passkey `origin`. Since 1.7.16 it threw at startup unless `origin` was set, and passkeys then worked only on the origins listed there, so tenants added at runtime needed a redeploy.

In that setup, without `origin`, a passkey is accepted only from an exact `allowedHosts` entry, the `fallback` origin, or an origin listed exactly in `trustedOrigins`. The host the request names and wildcard entries do not count. To allow tenants added at runtime, return their origins from a `trustedOrigins` function that checks your tenant records. If you set `origin`, or no wildcard covers your `rpID`, nothing changes.

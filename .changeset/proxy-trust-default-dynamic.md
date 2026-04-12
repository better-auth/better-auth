---
"better-auth": minor
---

dynamic `baseURL` path now honors `advanced.trustedProxyHeaders`

Previously, configs using `baseURL: { allowedHosts, ... }` implicitly trusted
`x-forwarded-host` and `x-forwarded-proto`, unlike the static-config path
which already gated them behind `advanced.trustedProxyHeaders`. This
inconsistency let an attacker behind a deployment that didn't strip
client-supplied `x-forwarded-*` pivot between any two hosts in
`allowedHosts` via header spoofing.

**Breaking change**: dynamic configs deployed behind a reverse proxy that
only exposes the public hostname via `x-forwarded-host` must now opt in
with `advanced.trustedProxyHeaders: true`. Deployments where the proxy
rewrites `Host:` to the public hostname (nginx default, Vercel, Cloudflare,
Netlify) are unaffected.

**Migration**:

```ts
betterAuth({
  baseURL: { allowedHosts: [...] },
  advanced: {
    trustedProxyHeaders: true, // add this if behind a proxy using x-forwarded-host
  },
});
```

---
"better-auth": minor
---

The dynamic `baseURL` path no longer trusts `x-forwarded-host` / `x-forwarded-proto` by default.

Configs using `baseURL: { allowedHosts }` previously honored these proxy headers implicitly, unlike the static-config path, which already gated them behind `advanced.trustedProxyHeaders`. On a deployment that does not strip client-supplied `x-forwarded-*`, that asymmetry let a request spoof its way to any host listed in `allowedHosts`. Both paths now ignore proxy headers unless you opt in.

**Breaking change:** if your proxy exposes the public hostname only through `x-forwarded-host` (rather than rewriting the `Host` header), set `advanced.trustedProxyHeaders: true`. Deployments where the proxy rewrites `Host` to the public hostname (nginx default, Vercel, Cloudflare, Netlify) are unaffected.

**Migration:**

```ts
betterAuth({
  baseURL: { allowedHosts: [...] },
  advanced: {
    trustedProxyHeaders: true,
  },
});
```

---
"better-auth": minor
---

The dynamic `baseURL` config now ignores `x-forwarded-host` and `x-forwarded-proto` unless you set `advanced.trustedProxyHeaders: true`.

Requests using `baseURL: { allowedHosts }` now resolve the auth origin from `Host` by default, so forwarded headers cannot select another allowed host unless trusted proxy headers are enabled.

**Breaking change:** if your proxy exposes the public hostname only through `x-forwarded-host`, set `advanced.trustedProxyHeaders: true`. Deployments where the proxy rewrites `Host` to the public hostname (nginx default, Vercel, Cloudflare, and Netlify) are unaffected.

**Migration:**

```ts
betterAuth({
  baseURL: { allowedHosts: [...] },
  advanced: {
    trustedProxyHeaders: true,
  },
});
```

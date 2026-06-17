---
"better-auth": minor
---

When serving multiple hosts through `trustedOrigins`, Better Auth derives the request origin from the `Host` header by default and ignores `x-forwarded-host` / `x-forwarded-proto` unless you set `advanced.trustedProxyHeaders: true`. Forwarded headers cannot select another trusted origin for cookies or links unless trusted proxy headers are enabled.

If your proxy exposes the public hostname only through `x-forwarded-host`, set `advanced.trustedProxyHeaders: true`. Deployments where the proxy rewrites `Host` to the public hostname (nginx default, Vercel, Cloudflare, and Netlify) are unaffected.

```ts
betterAuth({
  baseURL: "https://myapp.com",
  trustedOrigins: ["https://*.myapp.com"],
  advanced: {
    trustedProxyHeaders: true,
  },
});
```

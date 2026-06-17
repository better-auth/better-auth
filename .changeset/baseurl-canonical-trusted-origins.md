---
"better-auth": minor
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Better Auth can serve more than one hostname from a single instance: preview deployments, multiple custom domains, or white-label tenant domains. Keep `baseURL` as your canonical origin and list the additional hosts in `trustedOrigins`, which accepts a static array or a per-request function. Cookies and self-referential links (email verification, magic links, password reset) then follow the host a request arrived on when that origin is trusted, and otherwise fall back to `baseURL`.

```ts
betterAuth({
  baseURL: "https://myapp.com",
  trustedOrigins: ["https://*.vercel.app"],
})
```

Identity-bearing values stay on `baseURL` so they do not drift between hosts: the OAuth/OIDC issuer, JWT `iss`/`aud`, the social-login `redirect_uri`, and the Passkey relying-party id. For a genuinely separate identity per tenant, run one instance per tenant with its own `baseURL`.

`getRequestBaseURL`, exported from `better-auth/api`, returns the serving origin for the current request, including inside database hooks.

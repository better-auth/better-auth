---
"@better-auth/oauth-provider": minor
"@better-auth/ciba": patch
"@better-auth/cimd": patch
---

Setup errors and warnings about conflicting OAuth provider extensions now say which extensions are involved. For example, a duplicate grant type fails with `OAuth Provider extension "ext-a" and extension "ext-b" both register grant type "…"`. Before, the message named only the grant type.

Extensions accept an optional `name` for these messages. Plugin authors can pass their plugin's id to `extendOAuthProvider()`:

```ts
extendOAuthProvider(ctx, { name: "my-plugin", grants: { /* ... */ } });
```

An extension without a `name` is described by its position in registration order and, when it registers one, a grant type or similar, such as `unnamed extension #2 (grant type "…")`. The CIBA, CIMD, device authorization, and token exchange extensions are named after their plugins.

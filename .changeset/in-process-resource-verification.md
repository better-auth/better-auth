---
"@better-auth/oauth-provider": minor
---

Plugin endpoints served by the auth server can now verify an access token request in-process with `verifyResourceRequest` on the provider API. It accepts JWT and opaque access tokens, rejects revoked opaque tokens and tokens whose session has ended, enforces DPoP binding and nonces, and checks the `audience` and `scopes` you pass. On failure it throws a ready-to-send 401 or 403 with the matching `WWW-Authenticate` challenge.

```ts
const provider = getOAuthProviderApi(ctx, ctx.context.getPlugin("oauth-provider")!.options);
const claims = await provider.verifyResourceRequest({
  audience: "https://auth.example.com/api/auth/reports",
  scopes: ["read:reports"],
});
```

`requireActiveAccessToken` only checks that a token is active and does not verify a DPoP proof, so prefer `verifyResourceRequest` for protected endpoints.

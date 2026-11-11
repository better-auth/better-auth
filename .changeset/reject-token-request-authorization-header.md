---
"better-auth": minor
"@better-auth/core": minor
---

Generic OAuth providers with an `Authorization` entry in `authorizationHeaders`, in any letter case, now fail at startup with an error naming the provider. Before, Better Auth sent that header to the token endpoint, where it could conflict with the client authentication from `clientSecret` or `tokenEndpointAuth`. To send a provider-specific `Authorization` header, set it from `customizeRequest`. The custom method adds no client credentials. Your hook must also set every credential the provider requires, such as a `client_id`, a secret, or a client assertion:

```ts
tokenEndpointAuth: {
  method: "custom",
  customizeRequest({ body, headers }) {
    body.set("client_id", providerClientId);
    headers.authorization = `Provider ${providerCredential}`;
  },
},
```

Direct calls to `validateAuthorizationCode`, `authorizationCodeRequest`, `refreshAccessToken`, or `refreshAccessTokenRequest` from `@better-auth/core/oauth2` that pass `authorization` in `headers` now throw. Configs without an `Authorization` entry are unaffected.

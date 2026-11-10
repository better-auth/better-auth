---
"better-auth": minor
"@better-auth/core": minor
---

Generic OAuth configs that put an `Authorization` header in `authorizationHeaders`, in any letter case, now fail at startup with an error naming the provider. Before, that header was sent to the token endpoint next to, or in place of, the client authentication from `tokenEndpointAuth` or `clientSecret`.

Direct callers of `validateAuthorizationCode`, `authorizationCodeRequest`, `refreshAccessToken`, or `refreshAccessTokenRequest` from `@better-auth/core/oauth2` that pass `authorization` in `headers` now get an error instead of a token request.

To send a provider-specific `Authorization` header, set it from `customizeRequest`:

```ts
tokenEndpointAuth: {
  method: "custom",
  customizeRequest({ headers }) {
    headers.authorization = `Provider ${providerCredential}`;
  },
},
```

Other headers in `authorizationHeaders`, including `content-type` and `accept`, are still sent. Configs without an `Authorization` entry are unaffected.

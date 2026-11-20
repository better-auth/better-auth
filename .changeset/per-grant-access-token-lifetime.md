---
"@better-auth/oauth-provider": minor
---

`accessTokenExpiresIn` can now be a function that decides the access token lifetime per user grant. It receives the user, the client, the scopes, and the grant type, never anything from the request, and it runs again at each refresh. A throw fails the request, and an unusable result falls back to one hour, or to `accessTokenMaxExpiresIn` when that is lower. A result above the new `accessTokenMaxExpiresIn`, which defaults to one hour, is lowered to it. The grant revocation entry lasts that long plus one second, and the record of a redeemed authorization code lasts the longer of that and `refreshTokenExpiresIn`, so raise it to let the function return more. A number behaves as before, and `client_credentials` tokens still use `m2mAccessTokenExpiresIn`. Code that reads `accessTokenExpiresIn` from your options now sees a number or a function.

---
"@better-auth/core": minor
"better-auth": minor
---

Verify social-provider id_tokens with a single shared verifier.

Client-submitted id_token sign-in (`signIn.social({ idToken })` and account linking) is verified by one function instead of a per-provider `verifyIdToken` method. Each provider declares an `idToken` config with a JWKS source, issuer, and audience, and the core verifier runs the signature, issuer, audience, and nonce checks. A provider that declares no config rejects the client id_token path.

PayPal previously accepted any decodable id_token without verifying its signature. PayPal derives identity from the access token, so it now declares no `idToken` config, and the client id_token path returns `ID_TOKEN_NOT_SUPPORTED`. PayPal sign-in through the redirect flow is unchanged.

Custom providers that implement `OAuthProvider` directly replace the removed `verifyIdToken` method with an `idToken` config:

```ts
idToken: {
	jwks: createRemoteJWKSet(new URL("https://issuer.example/.well-known/jwks.json")),
	issuer: "https://issuer.example",
	audience: clientId,
},
```

For verification that cannot use a local JWKS, pass `idToken: { verify: async (token, nonce) => boolean }`. The `verifyIdToken` and `disableIdTokenSignIn` provider options are unchanged.

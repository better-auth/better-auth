---
"better-auth": patch
---

`auth.api.signJWT` can now set the token's `typ` and `cty` header and choose the signing key with `signingKeyId` or `signingAlgorithm`. The plugin still sets `alg` and `kid` from the selected key, and a `header` with any other member is rejected. With a custom `jwt.sign` function, the header and the key selection are passed to that function.

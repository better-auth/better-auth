---
"@better-auth/passkey": patch
---

fix(passkey): restore `exactOptionalPropertyTypes: true` compatibility

The passkey registration endpoints emitted `use: Middleware[] | undefined` in their generated type declarations, which is not assignable to `EndpointOptions.use?: Middleware[]` under `exactOptionalPropertyTypes: true`. The plugin no longer satisfied `BetterAuthPlugin`, which cascaded into lost inference on `auth.api.*` from unrelated plugins and on `authClient.passkey.*`. The declarations now emit `use: Middleware[]`; runtime behavior is unchanged.

Resolves #9212.

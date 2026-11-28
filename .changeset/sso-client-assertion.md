---
"@better-auth/sso": patch
---

`resolvePrivateKey` can return `clientAssertion` to sign the `private_key_jwt` assertion yourself, for providers that need header parameters Better Auth does not set, such as Microsoft Entra ID's `x5t#S256`.

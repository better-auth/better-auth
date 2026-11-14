---
"@better-auth/oauth-provider": minor
---

A per-issuance access-token claim set to `undefined` no longer removes a claim of the same name that an extension contributed. JWT access tokens now treat it as not supplied, as opaque-token introspection already did, so both formats return the extension's value.

**Behavior change:** a custom grant that passed `accessTokenClaims: { name: undefined }` to remove an extension's claim from a JWT access token now gets the extension's value. To change that claim, pass a value, such as `null`.

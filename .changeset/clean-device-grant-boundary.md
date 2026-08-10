---
"better-auth": minor
"@better-auth/oauth-provider": minor
---

OAuth device grants now require one shared `deviceCodeGrant()` instance in `deviceAuthorization({ grant })` and `oauthProvider({ extensions: [grant] })`. Configurations that installed `deviceCodeGrant()` as a separate plugin must adopt the shared setup. Standalone Device Authorization no longer accepts or stores RFC 8707 resources, and `onDeviceAuthRequest` receives only `clientId` and `scope`. The composed grant rejects resource indicators that are not absolute, fragment-free URIs.

The composed OAuth grant replaces the optional `resource` column with `oauthClientId` and `resources`. Regenerate and apply the schema when using the grant. Before upgrading from an earlier 1.7 prerelease, let pending OAuth device codes expire or delete them because they cannot be exchanged through the composed grant.

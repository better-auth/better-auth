---
"@better-auth/sso": minor
---

### Breaking: SAML configuration changes

**`callbackUrl` removed from `samlConfig`.**
The ACS URL is now always derived from your `baseURL` and `providerId`. Remove `callbackUrl` from your SAML provider configuration. The post-login redirect destination is set per sign-in via `callbackURL` in `signIn.sso()`:

```ts
await authClient.signIn.sso({
  providerId: "my-provider",
  callbackURL: "/dashboard",
});
```

**`/sso/saml2/callback/:providerId` endpoint removed.**
Update your IdP's ACS URL to `/sso/saml2/sp/acs/:providerId`. This endpoint handles both GET and POST requests.

**`spMetadata` is now optional.**
You no longer need to pass `spMetadata: {}` when registering a provider. SP metadata is auto-generated from your configuration.

**Removed unused fields from `SAMLConfig`:**
`decryptionPvk`, `additionalParams`, `idpMetadata.entityURL`, `idpMetadata.redirectURL`. These were stored but never read. Remove them from your configuration if present.

### Bug fixes

- Fix SLO SessionIndex matching: LogoutRequests with a SessionIndex were silently failing to delete the correct session.
- Audience validation now defaults to the SP entity ID when `audience` is not configured, per SAML Core section 2.5.1.
- Restore `AllowCreate` in AuthnRequests, required by IdPs that use JIT provisioning.
- SP metadata endpoint now reflects actual SP capabilities (encryption, signing, SLO).

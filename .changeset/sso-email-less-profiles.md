---
"@better-auth/sso": minor
---

SSO providers that send no email can now sign users in. The new `mapProfileToUser` option runs on every OIDC and SAML sign-in before the user is looked up, and can return the `email`, `name`, `image`, and `emailVerified` to use, such as a placeholder on the reserved `.invalid` domain. Previously these sign-ins failed with `missing_user_info`, and there was no way to supply an email. A returned email that differs from the provider's is stored unverified unless the callback also returns `emailVerified`, and a callback that throws redirects with `SSO_PROFILE_MAPPING_FAILED`.

**Breaking for SAML providers that send no email attribute:** the `NameID` now becomes the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`. Previously any NameID was used, so an opaque persistent or transient NameID was stored as the user's email. Those sign-ins are now rejected, including for users created that way before the upgrade. A SAML response without a usable email redirects with `error=missing_user_info` instead of `error=saml_error`. Providers that send an email attribute, or an `emailAddress`-format NameID, are unaffected.

To keep the previous behavior for affected providers, return the NameID from `mapProfileToUser`:

```ts
sso({
  mapProfileToUser: (input) => ({
    email:
      input.providerUser.email ??
      (input.protocol === "saml" ? input.nameID : undefined),
  }),
});
```

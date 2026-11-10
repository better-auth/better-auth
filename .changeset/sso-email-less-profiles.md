---
"@better-auth/sso": minor
---

SSO providers that send no email can now sign users in through the new `mapProfileToUser` option. It runs on every OIDC and SAML sign-in before the user is looked up, and can return the `email`, `name`, and `image` to use, such as a placeholder built with `createPlaceholderEmail` from `@better-auth/core/utils/email`. Previously an OIDC sign-in without an email failed with `missing_user_info`, and there was no way to supply one. A returned email that differs from the provider's is always stored unverified. A callback that throws or returns an invalid result redirects with `SSO_PROFILE_MAPPING_FAILED`.

**Breaking for SAML providers that send no email attribute:** the `NameID` now becomes the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`. Previously any NameID was used. A NameID with any other `Format`, including `persistent`, `transient`, `unspecified`, or no `Format` at all, is no longer used as the email, even when its value is an email address. Those sign-ins are now rejected, including for users created that way before the upgrade. A SAML response without a usable email redirects with `error=missing_user_info` instead of `error=saml_error`. Providers that send an email attribute, or an `emailAddress`-format NameID, are unaffected. To check, look at the NameID `Format` your IdP sends, or map an email attribute with `samlConfig.mapping.email`.

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

A NameID returned this way is stored unverified, even when `trustEmailVerified` is on and the IdP marks the email verified.

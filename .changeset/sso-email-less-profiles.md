---
"@better-auth/sso": minor
---

**Breaking for SAML providers that send no email attribute:** the `NameID` now becomes the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`. Previously any NameID was used. A `persistent`, `transient`, or `unspecified` NameID, or one with no `Format`, is no longer used even when its value is an email address. Those sign-ins succeeded before and are now rejected, including for users who signed in that way before the upgrade. A SAML response with no NameID or no usable email now redirects with `error=missing_user_info` instead of `error=saml_error`. Providers that send an email attribute or an `emailAddress`-format NameID are unaffected.

If your IdP sends another NameID `Format`, map an email attribute with `samlConfig.mapping.email`, or return the NameID from the new `mapProfileToUser` option:

```ts
sso({
  mapProfileToUser: (input) => ({
    email:
      input.providerUser.email ??
      (input.protocol === "saml" ? input.nameID : undefined),
  }),
});
```

Unlike before, a NameID returned this way is stored unverified, even with `trustEmailVerified` on.

OIDC and SAML providers that send no email can now sign users in through `mapProfileToUser`. It runs on every SSO sign-in before the user is looked up, and can return the `email`, `name`, and `image` to use, such as a placeholder built with `createPlaceholderEmail` from `@better-auth/core/utils/email`. Previously an OIDC sign-in without an email redirected with `error_description=missing_user_info`. A returned email that differs from the provider's is not marked verified, and a callback that throws or returns an invalid result redirects with `error=SSO_PROFILE_MAPPING_FAILED`.

---
"@better-auth/sso": minor
---

**Breaking for SAML providers that send no email attribute:** Better Auth now uses the `NameID` as the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`. Previously any NameID became the email, including `persistent`, `transient`, `unspecified`, and Format-less ones, even when the value was not an address. Those sign-ins now fail with `error=missing_user_info`, including for users who already signed in that way. Providers that send an email attribute or an `emailAddress`-format NameID are unaffected.

To keep signing these users in, map an email attribute with `samlConfig.mapping.email`, or return the NameID from the new `mapProfileToUser` option. A NameID returned this way is stored unverified, even with `trustEmailVerified` on.

```ts
sso({
  mapProfileToUser: (input) => ({
    email:
      input.providerUser.email ??
      (input.protocol === "saml" ? input.nameID : undefined),
  }),
});
```

A SAML response without a NameID now also redirects with `error=missing_user_info` instead of `error=saml_error`.

OIDC and SAML providers that send no email can now sign users in with `mapProfileToUser`. It runs on every SSO sign-in before the user is looked up, and returns the `email`, `name`, and `image` to use, such as a placeholder from `createPlaceholderEmail` in `@better-auth/core/utils/email`. Previously an OIDC sign-in without an email always failed with `error_description=missing_user_info`. A returned email that differs from the provider's is never marked verified. A callback that throws or returns an invalid result redirects with `error=SSO_PROFILE_MAPPING_FAILED`.

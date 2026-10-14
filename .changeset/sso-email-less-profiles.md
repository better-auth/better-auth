---
"@better-auth/sso": minor
---

SSO providers that send no email can now sign users in through the new `mapProfileToUser` option. It runs on every OIDC and SAML sign-in before the user is looked up, receives the provider's account key, profile, and raw claims or attributes, and can return the `email`, `name`, `image`, and `emailVerified` to use, such as a placeholder on the reserved `.invalid` domain. Previously these sign-ins failed with `missing_user_info`, and there was no way to supply an email.

**Breaking:** a SAML `NameID` now becomes the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`. Previously, a response without an email attribute used any NameID as the email, so an opaque persistent or transient NameID was stored as the user's email. Those sign-ins are now rejected, including for users created that way before. Providers that send an email attribute, or an `emailAddress`-format NameID, are unaffected.

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

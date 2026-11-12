---
"@better-auth/sso": minor
---

SAML sign-in now uses the `NameID` as the user's email only when its `Format` is `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`.

- **Breaking:** providers that send no email attribute and a NameID in another Format, or with no Format, now fail with `error=missing_user_info`, including for users who signed in that way before. Previously any NameID became the email, even when it was not an address.
- To keep these users signing in, send an `email` attribute or the `emailAddress` NameID Format from the IdP, set `samlConfig.mapping.email` to the attribute it does send, or return the NameID from `mapProfileToUser` as the SSO provisioning docs describe. The server log names the Format the IdP sent.
- Without `samlConfig.mapping.email`, the email is also read from the `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`, `mail`, and `urn:oid:0.9.2342.19200300.100.1.3` attributes.
- A SAML response without a NameID now redirects with `error=missing_user_info`, not `error=saml_error`.

---
"@better-auth/sso": minor
---

SAML users who sign in without a name attribute now get their email as their name, not the NameID.

- Previously an opaque NameID such as `a1b2c3d4-opaque` became the stored display name. The name attributes are `displayName`, `givenName`, and `surname`, unless remapped in `samlConfig.mapping`.
- In `mapProfileToUser`, `providerUser.name` is `undefined` in that case, and a name the callback returns is used.
- Existing users keep their stored name, unless `resolveUser` links them with `profile: "update"`, or `account.accountLinking.updateUserInfoOnLink` is on when their SSO account is first linked by email.

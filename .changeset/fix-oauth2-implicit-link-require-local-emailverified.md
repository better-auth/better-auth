---
"better-auth": patch
"@better-auth/core": patch
---

`handleOAuthUserInfo` (used by every social provider, generic-oauth, oauth-proxy, SSO OIDC and SAML, and idToken sign-in) implicitly linked a returning OAuth identity into a local user row whenever the IdP's `email_verified` claim was true or the provider was trusted. The local row's own `emailVerified` flag was read only to flip it after linking, never as a precondition. `POST /sign-up/email` creates rows with `emailVerified: false` for any caller, so an attacker who pre-registered a victim's email at the application could wait for the legitimate user's first OAuth sign-in: the IdP's verified claim was treated as ownership proof, and the victim's IdP identity was linked into the attacker-owned row.

The implicit-link gate now requires `dbUser.user.emailVerified === true` in addition to the provider trust check by default. A new `account.accountLinking.requireLocalEmailVerified` option (default `true`) is the public surface for this gate. Apps whose users sign up via OAuth without verifying their email locally can opt back into the legacy behavior with `account: { accountLinking: { requireLocalEmailVerified: false } }`; understand the takeover risk before doing so. The option is `@deprecated`; a FIXME at each gate site points at the next-minor follow-up on `next` that drops the option and makes the gate unconditional.

The `one-tap` plugin honored its own copy of the gate and was updated identically: `requireLocalEmailVerified` and `accountLinking.disableImplicitLinking` both apply on `/one-tap/callback`. The `email_verified` claim from the Google ID token is now normalized via `toBoolean` so a string `"false"` is treated as falsy.

Test fixtures across `admin`, `oidc-provider`, `mcp`, `generic-oauth`, `last-login-method`, and `oauth-provider` suites now mark users `emailVerified: true` via a `databaseHooks.user.create.before` hook (or the `disableTestUser` opt-in on the oauth-provider RP) so the suites continue to exercise their role/flow logic rather than the new gate.

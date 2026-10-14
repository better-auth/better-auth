---
"@better-auth/sso": patch
---

SAML providers that already have linked accounts can change `samlConfig.callbackUrl`, their post-login redirect, again. Since 1.7.0, that update returned 409 `Cannot change SSO provider identity fields while linked accounts exist`, because the redirect was still treated as the 1.6 Assertion Consumer Service URL. `guardProviderMutation` now reports a `callbackUrl`-only change with `isAuthenticationBoundaryChange: false`.

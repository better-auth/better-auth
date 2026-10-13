---
"@better-auth/sso": patch
---

OIDC providers that send the email claim as a list of addresses, such as Azure AD B2C's `emails`, can now sign users in. Previously the callback failed with `missing_user_info`, even with `mapping: { email: "emails" }`. Better Auth now uses the first address in the list. Providers that send `emails` instead of `email` need `mapping: { email: "emails" }`.

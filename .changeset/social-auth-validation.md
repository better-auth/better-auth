---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/sso": patch
"@better-auth/scim": patch
---

Add a `user.validateUserInfo` provisioning gate that lets applications reject an identity before a user is created or a new account is linked. It runs once at the creation step for every method that provisions a user (OAuth, SSO/SAML, email/password, magic link, email OTP, anonymous, SIWE, phone number, admin-created users, and SCIM), including stateless setups with no persistent database.

It also re-runs when an existing OAuth or SSO user signs in again (`source.action` is `"sign-in"`), where it receives the fresh provider email and profile so a domain or org policy can reject a user whose provider identity moved out of bounds. Non-provider returning sign-ins are not re-validated.

The callback receives the mapped `user` plus a `source` describing the `action` (`create-user`, `link-account`, or `sign-in`), the `method`, and provider metadata: `source.oauth` for OAuth providers and `source.sso` for OIDC/SAML SSO providers. Return `{ error, errorDescription }` to reject: browser flows redirect to the error URL and programmatic flows return a `403`.

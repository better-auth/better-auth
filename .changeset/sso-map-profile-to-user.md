---
"@better-auth/sso": minor
---

OIDC and SAML providers that send no email can now sign users in through the new `mapProfileToUser` option.

- It runs on every SSO sign-in before the user is looked up, and returns the `email`, `name`, and `image` to use, such as a placeholder from `createPlaceholderEmail` in `@better-auth/core/utils/email`. Previously an OIDC sign-in without an email always failed with `error_description=missing_user_info`.
- An email that differs from the provider's must be an email address and is never marked verified.
- A callback that throws or returns an invalid result redirects with `error=SSO_PROFILE_MAPPING_FAILED`.

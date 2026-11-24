---
"@better-auth/sso": patch
---

OIDC SSO sign-in now redirects to the error callback URL with an `invalid_provider` error when the UserInfo request fails, such as a dropped connection or an unreachable endpoint, instead of answering with a 500.

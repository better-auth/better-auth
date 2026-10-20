---
"@better-auth/sso": patch
---

OIDC SSO sign-in now rejects ID tokens missing `exp` or `iat` and providers with an empty client ID, matching social sign-in.

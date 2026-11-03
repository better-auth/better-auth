---
"@better-auth/oauth-provider": patch
---

JWT access tokens issued for a user now include `auth_time` (RFC 9068 §2.2.1), the time of the user's original authentication. It matches the ID token's `auth_time` and stays the same across refresh token rotation, so resource servers can require recent authentication before sensitive operations. `client_credentials` tokens and opaque access tokens are unchanged.

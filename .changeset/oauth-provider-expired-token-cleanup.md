---
"@better-auth/oauth-provider": patch
---

Clean up expired access and refresh tokens at the token endpoint, preventing unbounded table growth and ensuring expired token rows do not persist indefinitely.

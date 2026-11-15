---
"@better-auth/oauth-provider": patch
---

Revoking a refresh token, or replaying a rotated one, now retries the refresh-token family teardown when a delete fails, such as when it loses a MySQL deadlock to a concurrent refresh by the same client and user. The request still fails if all three attempts fail.

---
"@better-auth/oauth-provider": minor
---

`max_age` is now enforced. When a client requests `max_age` and the user authenticated longer ago than that window, the provider sends them back to log in, and the resulting ID token's `auth_time` reflects the fresh login. Previously `max_age` was accepted but ignored, so flows that relied on it being a no-op will now prompt the user to log in again.

---
"better-auth": patch
---

The `oauth-proxy` callback now forwards `result.error` from `handleOAuthUserInfo` as the `?error=` query value (e.g. `?error=signup_disabled`) instead of collapsing every error into a generic `?error=user_creation_failed`. Matches the behavior of the core OAuth callback and generic-oauth. The `user_creation_failed` value is still used as a fallback when `result.data` is missing without an explicit error.

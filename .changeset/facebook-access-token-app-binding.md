---
"@better-auth/core": patch
---

Validate Facebook opaque access tokens against the configured app. Previously `verifyIdToken` returned `true` for any non-JWT token and `getUserInfo` called Graph `/me` with the caller-supplied token without checking which app issued it, so tokens issued for other Facebook apps were not distinguished on the direct sign-in path. Facebook tokens are now inspected via the `debug_token` endpoint, requiring `is_valid`, an `app_id` that matches one of the configured client ids, and a `user_id` that matches the returned profile, before the token is accepted. A client secret must be configured for access-token sign-in to work.

---
"better-auth": patch
"@better-auth/core": patch
---

Preserve previously granted OAuth scopes across sign-in re-authentication and refresh-token requests. `account.scope` now accumulates monotonically: newly granted scopes are merged in only when added via `linkSocial`, and providers returning a narrower scope claim than the user has granted no longer shrink the stored value.

---
"better-auth": patch
---

If you use the `lastLoginMethod` plugin with `oneTap`, signing in through Google One Tap now records `"google"`, the same value as signing in with the Google button. Before, a One Tap sign-in recorded nothing: the `better-auth.last_used_login_method` cookie kept its previous value or stayed unset, and so did `user.lastLoginMethod` with `storeInDatabase`.

If your `customResolveMethod` includes a `/one-tap/callback` → `"google"` workaround, remove that mapping; keep the resolver if it handles other routes.

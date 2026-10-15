---
"better-auth": patch
---

If you set `autoSelect` or `cancelOnTapOutside` on `oneTapClient()`, the One Tap prompt and the Sign in with Google button now use them. Before, only values passed to `authClient.oneTap()` took effect, so with `autoSelect: true` on the plugin, returning users still had to pick an account. Values passed to `oneTap()` still override the plugin's. Apps that set these options only on `oneTap()`, or not at all, are unaffected.

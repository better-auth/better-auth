---
"better-auth": patch
---

`oneTapClient` now applies `autoSelect` and `cancelOnTapOutside` when you set them on the plugin, for both the One Tap prompt and the button. Previously, only values passed to `authClient.oneTap()` took effect, so setting them on the plugin did nothing. Values passed to `oneTap()` still override the plugin's.

---
"better-auth": minor
---

Add an `active` mode to the One Tap client plugin. Passing `mode: "active"` alongside the `button` option opts the rendered Sign in with Google button into Google's FedCM button flow, so clicking it opens the browser's centered account chooser instead of a popup window, and `autoSelect` becomes the flow's auto select.

---
"better-auth": minor
---

Add an `active` mode to the One Tap client plugin. Passing `mode: "active"` opens the browser's centered account chooser instead of the passive corner prompt, so One Tap can be triggered from your own sign-in button. It falls back to the passive prompt when the browser has no FedCM support, and reports a dismissed chooser through `onPromptNotification`.

---
"better-auth": minor
---

If you render the Sign in with Google button with `authClient.oneTap({ button })`, you can now set `button: { container, fedCM: true }` to open the browser's account chooser over the page instead of Google's popup window. With `autoSelect: true`, a returning user who is signed in to Google skips the chooser. This uses Google's FedCM button flow on Chrome 125+ on desktop and Chrome 128+ on Android; other browsers keep the popup. Existing prompt and button setups are unchanged.

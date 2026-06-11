---
"better-auth": patch
---

Google One Tap now requires a configured Google client ID and rejects the sign-in callback when none is set. A Google ID token issued for a different application is no longer accepted. Set the client ID on the `oneTap` plugin or on `socialProviders.google`.

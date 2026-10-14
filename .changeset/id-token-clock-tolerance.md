---
"@better-auth/core": patch
---

ID token verification now allows 30 seconds of clock difference between your server and the identity provider when checking `exp`, `nbf`, and `iat`. Previously, a provider whose clock ran even slightly ahead (for example, an `nbf` set a fraction of a second in the future) made sign-in fail. This affected generic OAuth providers configured with `discoveryUrl` since 1.7.0, ID token sign-in with any provider, and Google One Tap. Tokens up to 30 seconds past `exp` are now also accepted. No configuration change is needed.

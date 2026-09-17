---
"better-auth": patch
---

Verify the Google One Tap `nonce` option on the server. The `/one-tap/callback` endpoint now accepts an optional `nonce` and forwards it to `verifyGoogleIdToken`, so ID tokens minted with a nonce are bound to the sign-in attempt that requested them instead of remaining replayable.

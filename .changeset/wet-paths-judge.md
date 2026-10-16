---
"@better-auth/core": patch
---

Twitch and Paybin sign-in now verify ID token signatures and identity claims before mapping profiles, with 30 seconds of clock tolerance. Custom Paybin issuers must expose RS256 signing keys at `<issuer>/.well-known/jwks.json`.

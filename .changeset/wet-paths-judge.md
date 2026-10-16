---
"@better-auth/core": patch
---

Twitch and Paybin sign-in now reject ID tokens with invalid signatures, unexpected issuers or audiences, expired tokens, or missing required identity claims. Custom Paybin issuers must expose their RS256 signing keys at the documented JWKS endpoint.

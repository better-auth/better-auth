---
"@better-auth/oauth-provider": patch
---

Add the `assertionClockTolerance` option so a `private_key_jwt` client whose clock runs a few seconds ahead of or behind the server no longer fails token exchange with "client assertion signature verification failed". The default of `0` keeps the current strict check, and values above 60 seconds are treated as 60.

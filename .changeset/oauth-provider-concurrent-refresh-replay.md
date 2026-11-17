---
"@better-auth/oauth-provider": minor
---

Refresh requests that overlap on the same refresh token now get the same rotated response when `refreshTokenReuseInterval` is set, instead of `invalid_grant`. The duplicate waits for the first request to store its response, for at most five seconds whatever the interval, and fails with `invalid_grant` if the response does not appear in that time. A duplicate also stops waiting as soon as the first request fails, but if the failure cannot be recorded, it waits out the five seconds. A DPoP-bound duplicate reuses the proof the first check accepted. The default interval, `0`, is unchanged, and `mcp()` sets the interval to 30 seconds, so its clients get the new behavior.

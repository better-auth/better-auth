---
"better-auth": patch
---

Rate limiting now uses a fixed window anchored to the first request instead of sliding it on every request. Steady traffic below the limit (for example, one request every 59 seconds with `window: 60, max: 20`) is no longer rejected with `429`, and the OAuth device flow polling `/oauth2/token` every 5 seconds no longer fails partway through the device code lifetime. Burst protection is unchanged: requests over `max` within the window are still rejected.

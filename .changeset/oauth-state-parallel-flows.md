---
"better-auth": patch
---

Keep every in-flight sign-in in the cookie state strategy instead of only the newest. `oauth_state` held a single flow, so a second sign-in started within its 10 minute window replaced the nonce the first one still needed and that flow failed its callback with `state_security_mismatch`. Two tabs, a retry after a failure, or an authorize URL still open in history were enough to trigger it. The cookie now holds up to five pending flows, the callback consumes only the one it matches, and cookies written before this change still parse. A flow whose own state is too large for a cookie is now rejected at sign-in with `state_generation_error`, rather than writing a cookie the browser drops and failing later at the callback.

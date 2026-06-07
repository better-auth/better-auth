---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

Run configured hooks through the whole OAuth sign-in flow

`hooks.before` / `hooks.after` configured on the auth instance now run for the OAuth authorization that continues after a user signs in, selects an account, or consents. They were being skipped there.

Headers or cookies a `hooks.before` sets before returning its own response are no longer dropped, and a `hooks.after` that throws an `APIError` no longer loses either its cookies or the error's headers.

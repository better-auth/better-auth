---
"@better-auth/oauth-provider": patch
---

If you use `postLogin` with the documented organization selector, users who belong to more than one organization can now finish authorization. Since v1.6.16, selecting an organization and calling `oauth2.continue({ postLogin: true })` sent these users back to the selection page every time.

`postLogin.shouldRedirect` now receives `isContinuation`, which is `true` when the user returns from your post login page. To stop the loop, update your callback to match the [Post Login Screen example](https://www.better-auth.com/docs/plugins/oauth-provider#post-login-screen): on a new authorization, ask users with several organizations to choose; on continuation, return `false` once the session's active organization is one the user belongs to. Callbacks that do not read `isContinuation` behave as before.

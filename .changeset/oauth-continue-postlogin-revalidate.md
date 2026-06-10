---
"@better-auth/oauth-provider": patch
---

The `/oauth2/continue` post-login step no longer treats the client-submitted `postLogin` flag as proof that an interactive gate completed. Completion is now derived from the server-issued, session-bound marker on the signed `oauth_query` (matching the consent endpoint); when it is absent, `authorize` re-runs `postLogin.shouldRedirect` against the current session and redirects back to the gate if selection is still required.

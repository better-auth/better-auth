---
"better-auth": minor
"@better-auth/oauth-provider": patch
---

Run configured hooks when OAuth authorize resumes after sign-in

Configured `hooks.before` / `hooks.after` now run when the OAuth provider resumes `/oauth2/authorize` after a fresh sign-in, account selection, or consent. The resume previously called the authorize function directly and skipped the hook pipeline, so a hook registered on the auth instance ran for a standalone authorize request but not the post-login resume.

The hook pipeline is now a shared `dispatchAuthEndpoint` primitive, exported from `better-auth/api`. A plugin re-runs the configured hooks for one endpoint by dispatching it, rather than calling it as a plain function. Internal endpoint-to-endpoint calls (for example resolving the session through the `getSession` endpoint) still skip hooks, so a single request does not fire them twice.

This also corrects two hook header cases. A `hooks.before` that sets response headers or cookies before short-circuiting now keeps them on the response instead of dropping them. A `hooks.after` that throws an `APIError` now merges the cookies it accumulated with the error's explicit headers, so neither side is lost.

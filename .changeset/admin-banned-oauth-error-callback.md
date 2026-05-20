---
"better-auth": patch
---

Banned users signing in with an OAuth provider now redirect to the `errorCallbackURL` passed to `signIn.social`, with `?error=BANNED_USER&error_description=<message>` in the query string. Previously the redirect went to the auth server's default error page with `?error=banned`, which broke multi-domain deployments where the auth host and frontend host differ. The `oauth-proxy` callback now also redirects banned users to the error URL (previously returned JSON 403).

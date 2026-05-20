---
"@better-auth/sso": patch
"better-auth": patch
---

Banned users signing in with an OAuth provider now redirect to the `errorCallbackURL` passed to `signIn.social`, with `?error=BANNED_USER&error_description=<message>` in the query string. Previously the redirect went to the auth server's default error page with `?error=banned`, which broke multi-domain deployments where the auth host and frontend host differ. The `oauth-proxy`, SSO OIDC, and SAML callbacks now also redirect hook rejections to the error URL (previously returned JSON 403), and `oauth-proxy` URL-encodes the `error` query value across all its redirects.

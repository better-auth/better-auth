---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider): add `validateRedirectURI` to authorize dynamic redirect URIs

Adds an optional `validateRedirectURI` hook to the OAuth provider options. It is
consulted during `/authorize` only after the built-in exact-match and RFC 8252
loopback-IP checks fail, letting servers accept a `redirect_uri` that isn't in
the client's registered `redirectUris` — for dynamic or ephemeral targets (e.g.
per-branch preview deployments) whose hostnames can't be pre-registered.

The hook receives the endpoint `ctx`, the resolved `client`, and the requested
`redirectURI`, and returns a boolean. A declined or unhandled URI still fails
with `invalid_redirect`, and the error is sent to the auth server's error page,
never the untrusted target.

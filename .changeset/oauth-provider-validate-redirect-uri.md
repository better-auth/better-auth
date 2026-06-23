---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider): add `validateRedirectURI` to authorize dynamic redirect URIs

Adds an optional `validateRedirectURI` hook to the OAuth provider options. It is
consulted as a last resort, only after the built-in checks fail, letting servers
accept a redirect target that isn't in the client's registered list — for dynamic
or ephemeral targets (e.g. per-branch preview deployments) whose hostnames can't
be pre-registered.

The hook receives the endpoint `ctx`, the resolved `client`, the requested
`redirectURI`, and a `type` discriminator, and returns a boolean. It covers two
flows:

- `type: "authorize"` — the `redirect_uri` at `/oauth2/authorize`, consulted after
  the exact-match and RFC 8252 loopback-IP checks against `redirectUris` fail. A
  declined URI fails with `invalid_redirect`, sent to the auth server's error page,
  never the untrusted target.
- `type: "logout"` — the `post_logout_redirect_uri` at RP-Initiated Logout,
  consulted after the exact-match check against `postLogoutRedirectUris` fails. A
  declined URI ends the session without redirecting to the untrusted target.

Because `"authorize"` delivers the authorization code, validate it most strictly;
only relax rules for `"logout"`, never the reverse.

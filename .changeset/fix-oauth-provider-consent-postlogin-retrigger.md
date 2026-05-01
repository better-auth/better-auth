---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): bind consent-accept postLogin skip to the signing session

When `authorize` emits a signed redirect past the postLogin gate it now
records `ba_pl=<sessionId>` in the signed authorization query. On consent
accept, `authorizeEndpoint` is called with `{ postLogin: true }` only when
the incoming signed query's marker matches the current session's id;
otherwise it re-enters `authorize` with `postLogin.shouldRedirect` still
enforced. Resolves the post-consent bounce back to the postLogin page for
`setActive`-driven flows, blocks a direct POST to `/oauth2/consent` with
a pre-postLogin signed query from skipping `shouldRedirect`, and prevents
a different or newly logged-in session from re-using another session's
marker to skip `shouldRedirect`.

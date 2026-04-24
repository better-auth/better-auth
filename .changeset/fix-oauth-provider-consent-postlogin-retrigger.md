---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): gate consent-accept postLogin skip on signed query marker

When `authorize` emits a signed redirect past the postLogin gate it now
records a `ba_pl=1` marker in the signed authorization query. On consent
accept, `authorizeEndpoint` is called with `{ postLogin: true }` only when
the incoming signed query carries that marker; otherwise it re-enters
`authorize` with `postLogin.shouldRedirect` still enforced. Resolves the
post-consent bounce back to the postLogin page for `setActive`-driven
flows, and prevents a direct POST to `/oauth2/consent` with a pre-postLogin
signed query from skipping `shouldRedirect` to issue an authorization code.

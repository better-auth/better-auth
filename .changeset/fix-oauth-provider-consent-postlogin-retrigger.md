---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): skip postLogin re-check when consent is accepted

Consent accept now passes `{ postLogin: true }` to the authorize endpoint so
the post-consent pass does not re-evaluate `postLogin.shouldRedirect`. Prior
behavior could bounce the user back to the postLogin page after accepting
consent whenever `shouldRedirect` returned true at that point (for example,
when session state that `setActive` wrote is not visible to the consent
request, or when the integration's `shouldRedirect` logic depends on a flag
that is not session-persistent).

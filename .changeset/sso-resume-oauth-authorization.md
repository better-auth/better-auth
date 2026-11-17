---
"@better-auth/oauth-provider": patch
---

Signing in through an OIDC provider with `signIn.sso` on the login page of an OAuth authorization now continues that authorization, as social sign-in already did. Before, the user was left on the sign-in `callbackURL` and the OAuth client never received a code. SAML providers on `/sign-in/sso` are still not resumed, and neither are other sign-in endpoints that leave for an external provider. A rule that resumes any of them from the signed `oauth_query` in the request body is deferred.

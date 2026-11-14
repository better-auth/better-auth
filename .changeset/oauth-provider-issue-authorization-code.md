---
"@better-auth/oauth-provider": minor
---

Plugin endpoints can now issue authorization codes without a redirect: `issueAuthorizationCode({ query, session })` on the provider API (`getOAuthProviderApi`) returns a code for a signed-in user.

The request is checked as `/oauth2/authorize` checks it, including the client, the `redirect_uri` when present, scopes, claims, resources, and PKCE. The user's stored consent or the client's `skip_consent` is required. A step that needs a page fails with `consent_required`, `login_required`, or `interaction_required` instead of redirecting, and an unmet essential `acr` fails with `access_denied`. Without `redirect_uri`, the code is only returned, and the token request omits `redirect_uri`. Set `dpop_jkt` to bind the code to a DPoP key.

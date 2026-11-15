---
"@better-auth/oauth-provider": minor
---

Plugin endpoints can now issue authorization codes without a redirect: `issueAuthorizationCode({ query, session })` on the provider API (`getOAuthProviderApi`) returns a code for a signed-in user. Your endpoint authenticates the user; the code is issued for the session you pass, without account selection.

The request is checked as `/oauth2/authorize` checks it, including the client, the `redirect_uri` when present, scopes, claims, resources, and PKCE. The user's stored consent or the client's `skip_consent` is required. A step that needs a page fails with `consent_required`, `login_required`, or `interaction_required` instead of redirecting, and an unmet essential `acr` fails with `access_denied`. `prompt=login` and `max_age=0` are accepted when your endpoint signs the user in during the same request and passes that new session. Without `redirect_uri`, the code is only returned, and the token request omits `redirect_uri`.

The method authenticates the client from the request as `/oauth2/par` does, binds the code to the key of a DPoP proof on the request, and leaves client credentials out of the stored request. A `client_id` that names another client fails with `invalid_client`, and a `dpop_jkt` that names a key other than the proof's fails with `invalid_dpop_proof`. A required PAR policy applies only to `/oauth2/authorize` and does not block the method, which rejects a `request_uri`.

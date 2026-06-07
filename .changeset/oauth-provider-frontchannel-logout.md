---
"@better-auth/oauth-provider": minor
---

Add OIDC Front-Channel Logout 1.0 support to `@better-auth/oauth-provider`.

When the end-user terminates their session with a browser navigation to `/oauth2/end-session`, the provider now responds with a logout page containing one hidden iframe per OAuth client that holds tokens on the session and has registered a `frontchannel_logout_uri`. The browser fans the logout out by loading each RP's URI so the RP can clear its own session cookies; once every iframe has settled — or after a 3-second safety timeout — the page redirects to the validated `post_logout_redirect_uri` when one was provided. Clients opt in by registering `frontchannel_logout_uri` (and optionally `frontchannel_logout_session_required`, which makes the provider append `iss` and `sid` query parameters) via DCR or the admin client endpoints.

The URI is validated at registration with the same rules as `backchannel_logout_uri` (absolute http/https URL, no fragment, https for confidential clients with a loopback carve-out, non-public hosts rejected), but unlike back-channel logout it works with `disableJwtPlugin: true`, since nothing is signed.

Behavior is unchanged when no front-channel client holds tokens on the session (immediate redirect, as before) and for fetch-style requests to `/oauth2/end-session`, which keep the JSON contract.

Discovery documents at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` now advertise `frontchannel_logout_supported: true` and `frontchannel_logout_session_supported: true`.

Schema changes on `@better-auth/oauth-provider`:

- `oauthClient.frontchannelLogoutUri: string | null`
- `oauthClient.frontchannelLogoutSessionRequired: boolean`

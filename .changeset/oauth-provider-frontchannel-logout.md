---
"@better-auth/oauth-provider": minor
---

OAuth providers can now notify relying parties of logout through the browser with OpenID Connect Front-Channel Logout 1.0. Register a `frontchannel_logout_uri` on a client, using the scheme, host, and port of one of its `redirect_uris`, through dynamic registration or the client create and update endpoints. When a user's session ends during a browser navigation to `/oauth2/end-session`, the provider shows a short page that loads each such client's URI in a hidden iframe with `iss` and `sid` appended, then continues to the verified `post_logout_redirect_uri`. Clients with a front-channel URI also receive `sid` in their ID tokens, and discovery now advertises `frontchannel_logout_supported` and `frontchannel_logout_session_supported`.

Front-channel logout works without the `jwt` plugin. It is reliable only when the provider and its relying parties share a registrable domain, because browsers block or partition third-party cookies; use back-channel logout for relying parties on other sites. It does not run for `/sign-out`, admin revocation, session expiry, or fetch-style calls to `/oauth2/end-session`, which keep their current responses.

Providers with no client registering `frontchannel_logout_uri` see no change. This release adds `frontchannelLogoutUri` and `frontchannelLogoutSessionRequired` columns to the `oauthClient` table; run `npx auth migrate`, or `npx auth generate` if you manage the schema yourself.

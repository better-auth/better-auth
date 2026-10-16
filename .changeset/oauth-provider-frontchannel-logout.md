---
"@better-auth/oauth-provider": minor
---

OAuth providers can now notify relying parties through the browser with OpenID Connect Front-Channel Logout 1.0. Register a `frontchannel_logout_uri` on a client, using the scheme, host, and port of one of its `redirect_uris`. When a user logs out through `/oauth2/end-session` in the browser, the provider loads that URI in a hidden iframe with `iss` and `sid`, then continues to the verified `post_logout_redirect_uri`. Clients with this URI also receive `sid` in their ID tokens.

Front-channel logout is reliable only when the provider and its relying parties share a registrable domain, because browsers block or partition third-party cookies. Use back-channel logout for relying parties on other sites. Providers with no front-channel clients see no change.

Run `npx auth@latest migrate`, or `npx auth@latest generate` if you manage the schema yourself, to add the `frontchannelLogoutUri` and `frontchannelLogoutSessionRequired` columns to `oauthClient`.

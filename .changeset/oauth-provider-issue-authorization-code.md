---
"@better-auth/oauth-provider": patch
---

Plugins that sign users in through their own endpoint can now issue a standard authorization code without a redirect. `validateAuthorizationRequest()` on `getOAuthProviderApi(ctx, opts)` checks a request by the same rules as `/oauth2/authorize`, and `issueAuthorizationCode()` stores the code and returns it with its expiry. The client redeems it at `/oauth2/token` with the same PKCE, `redirect_uri`, `dpop_jkt`, and resource checks as any other code. `authenticationContext.resolve` now also receives `authentication`, with the time and methods the plugin reports, when it runs for such a code.

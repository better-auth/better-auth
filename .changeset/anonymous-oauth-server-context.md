---
"better-auth": minor
"@better-auth/oauth-provider": patch
"@better-auth/sso": patch
---

Anonymous account linking now works after social and generic OAuth sign-in in Expo and other in-app browsers, where the OAuth callback returns without the session cookie. `onLinkAccount` fires and the anonymous user is migrated; before, it was silently skipped.

Plugins can now carry server-trusted data across an OAuth redirect with the new `addOAuthServerContext` API, read back on the callback via `getOAuthState().serverContext`. Unlike `additionalData`, it cannot be set from the request body, so it is the right place for values the server must trust.

For `@better-auth/oauth-provider`, the post-login authorization query now travels through that server-only channel, so it can no longer be injected through `additionalData`.

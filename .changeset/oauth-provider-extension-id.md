---
"@better-auth/oauth-provider": minor
"@better-auth/ciba": patch
"@better-auth/cimd": patch
---

OAuth provider extensions now require a unique `id`, and setup errors and discovery warnings name the extensions involved. For example, a duplicate grant type now fails with `OAuth Provider extensions "ext-a" and "ext-b" both register grant type "…"`. Before, the error did not say which extensions conflicted.

Add an `id` to every extension you pass to `extendOAuthProvider()` or `oauthProvider({ extensions })`, usually the id of the plugin that registers it. Without one, TypeScript reports a missing property and startup fails. Two extensions with the same `id` also fail at startup.

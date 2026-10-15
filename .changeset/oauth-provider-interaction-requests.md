---
"@better-auth/oauth-provider": minor
---

Plugins that extend OAuth Provider through `extendOAuthProvider()` can register `interactionRequests`: requests other than an authorization request, keyed by a query parameter, that users approve on the provider's sign-in, account selection, post-login, and consent pages. The provider resumes them through `/oauth2/authorize`, can require consent on every approval, and sends errors to a page the request names. `oauthDeviceAuthorization()` uses one keyed by `user_code`.

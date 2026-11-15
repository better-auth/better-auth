---
"@better-auth/oauth-provider": minor
---

`provider.issueAuthorizationCode()` accepts `amr`, so a plugin endpoint can report the authentication methods it verified, such as `["pwd", "otp"]`. `authenticationContext.resolve` receives them as `amr` and decides the code's `acr` and `amr`. Without a resolver, the ID token carries the reported `amr`, as with `issueTokens()` and `completeCibaRequest()`. `auth_time` still comes from the session.

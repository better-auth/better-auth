---
"@better-auth/oauth-provider": minor
---

`provider.issueAuthorizationCode()` accepts `authentication: { amr }`, so a plugin endpoint can report the methods it verified, such as `["pwd", "otp"]`. `authenticationContext.resolve` receives them as `authentication` and decides the code's `acr` and `amr`. Without a resolver, the code's ID token carries the reported `amr`. `auth_time` still comes from the session.

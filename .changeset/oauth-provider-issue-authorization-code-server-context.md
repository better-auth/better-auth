---
"@better-auth/oauth-provider": minor
---

`provider.issueAuthorizationCode()` accepts `serverContext`, so a plugin endpoint can store its own values with the code and read them back when the client redeems it, as `verificationValue.serverContext` in `customTokenResponseFields`. The values are kept apart from the code's user, session, scopes, and bindings, so they cannot change the tokens, and a code from `/oauth2/authorize` never carries any.

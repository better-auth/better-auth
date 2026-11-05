---
"@better-auth/oauth-provider": minor
---

Apps with protected dynamic client registration can now give a machine client its `client_credentials` scopes at registration. Return `clientCredentialsScopes` from `validateInitialAccessToken` alongside `referenceId`, and the client registers with that scope ceiling. Before, an administrator had to assign it afterwards through `adminUpdateOAuthClient`. Registration fails if a scope is one the provider does not offer, or if the client is public or does not register the `client_credentials` grant. Apps that don't return the field see no change.

---
"@better-auth/sso": patch
"better-auth": patch
---

Separate SSO provider ids from the account-linking provider namespace used for social/OAuth providers. Previously an SSO provider registered with an id matching a configured `accountLinking.trustedProviders` entry (e.g. `google`) was treated as a trusted provider and could implicitly link to an existing verified account with the same email.

SSO registration now rejects provider ids that collide with a configured social provider, a `trustedProviders` entry, or a reserved built-in id. In addition, the OIDC and SAML callbacks no longer derive trust from a `trustedProviders` name match — SSO trust comes solely from verified domain ownership (`domainVerified`). `handleOAuthUserInfo` gains a `trustProviderByName` option (default `true`, preserving social-provider behavior) that the SSO plugin sets to `false`.

---
"@better-auth/core": minor
"@better-auth/sso": minor
"better-auth": minor
---

Add transaction-bound SSO user resolution for OIDC and SAML. The new `resolveUser` callback can use a verified provider identity to select an existing Better Auth User, apply the default authentication behavior, or reject authentication. Exact links must declare whether Better Auth preserves the local User profile or updates it from the verified provider profile.

Provider profiles passed to `authenticateProviderUser` no longer include the provider subject as a Better Auth User ID. The option is renamed from `userInfo` to `providerUser`, with provider identity supplied separately.

OAuth Proxy callback packages now store `providerUser` instead of `userInfo`. Deploy the proxy and application on the same Better Auth version; mixed-version deployments reject these encrypted callback packages.

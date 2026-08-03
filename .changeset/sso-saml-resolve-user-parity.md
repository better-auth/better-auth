---
"@better-auth/sso": minor
---

Extend `resolveUser` to SAML sign-ins. The callback now receives a discriminated `protocol` field: OIDC input keeps `verifiedIdTokenClaims` and `providerClaims`, while SAML input carries the verified assertion's `providerAttributes`. Both variants include a `providerReference`, an opaque reference to the accepted provider configuration that detects provider replacement or configuration changes mid-flow.

Add `guardProviderMutation`, a callback that authorizes updates and deletions of a persisted SSO provider before Better Auth applies them.

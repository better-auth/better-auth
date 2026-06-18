---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider)!: report unspecified OIDC ACR and keep ID token authority claims provider-owned

The OIDC `acr` claim and `acr_values_supported` discovery value now report `"0"` (unspecified) instead of the InCommon bronze URN. `customIdTokenClaims` can no longer override provider-owned ID token claims such as issuer, subject, audience, token lifetime, nonce, `sid`, hash-binding claims, `auth_time`, `acr`, `amr`, or `azp`; reserved names are stripped with a warning.

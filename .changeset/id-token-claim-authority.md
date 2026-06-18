---
"@better-auth/oauth-provider": minor
---

feat(oauth-provider)!: report unspecified OIDC ACR and keep ID token authority claims provider-owned

The OIDC `acr` claim now reports `"0"` (unspecified) instead of the InCommon bronze URN, and default discovery no longer advertises `acr_values_supported` because Better Auth does not evaluate requested ACR values yet. `customIdTokenClaims`, extension ID-token claims, and per-issuance ID-token claims can no longer override provider-owned ID token claims such as issuer, subject, audience, token lifetime, nonce, `sid`, hash-binding claims, `auth_time`, `acr`, `amr`, or `azp`; reserved names are stripped with a warning.

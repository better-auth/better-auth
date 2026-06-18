---
"@better-auth/oauth-provider": minor
---

ID tokens now report `acr: "0"` instead of the InCommon Bronze URI. The default OpenID discovery document no longer advertises `acr_values_supported`, since the provider does not support requestable ACR classes yet.

`customIdTokenClaims`, extension ID-token claims, and per-issuance `idTokenClaims` can no longer set OIDC/JWT protocol claims such as issuer, subject, audience, token lifetime, nonce, session or hash binding, `auth_time`, `acr`, `amr`, or `azp`. Namespaced custom claims still appear in ID tokens.

---
"@better-auth/oauth-provider": minor
---

ID tokens now use `acr: "0"`, indicating that authentication did not meet
ISO/IEC 29115 level 1, and OpenID discovery advertises only `"0"`. Because
`acr_values` is voluntary, requests for other classes continue instead of
failing. Essential `claims.id_token.acr` requests still fail when their
required `value` or `values` cannot be met.

`customIdTokenClaims`, extension ID-token claims, and per-issuance `idTokenClaims` can no longer set OIDC/JWT protocol claims such as issuer, subject, audience, token lifetime, nonce, session or hash binding, `auth_time`, `acr`, `amr`, or `azp`. Namespaced custom claims still appear in ID tokens.

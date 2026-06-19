---
"@better-auth/oauth-provider": patch
---

Keeps `profile` and `email` scope claims on the OIDC UserInfo response instead of adding them to authorization-code ID tokens by default, advertises `acr_values_supported: ["0"]`, and rejects unsupported
`acr_values` authorization requests instead of silently downgrading them.

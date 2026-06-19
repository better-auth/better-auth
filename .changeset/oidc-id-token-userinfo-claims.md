---
"@better-auth/oauth-provider": patch
---

Keeps `profile` and `email` scope claims on the OIDC UserInfo response instead of adding them to authorization-code ID tokens by default, and advertises the default `acr_values_supported` value.

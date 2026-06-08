---
"@better-auth/oauth-provider": minor
---

ID tokens and the `acr_values_supported` discovery value now report `"0"` (the RFC 6711 "unspecified" value) instead of `urn:mace:incommon:iap:bronze`. Relying parties that hardcoded the bronze value must update to `"0"`.

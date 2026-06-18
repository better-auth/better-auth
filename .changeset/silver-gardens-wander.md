---
"@better-auth/core": patch
---

Add `includeGrantedScopes` option to the Google provider. Set to `false` to omit `include_granted_scopes=true` from the authorization URL by default so each OAuth flow requests only its own scopes instead of accumulating prior grants. Defaults to `true`, preserving current behavior; call-time `additionalParams` still wins for single-flow overrides.

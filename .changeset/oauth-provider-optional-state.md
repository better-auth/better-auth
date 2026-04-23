---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): accept authorization-code flows without `state`

Align authorization-code verification with the authorize endpoint and OAuth/OIDC semantics by treating `state` as optional for the authorization server. The provider still echoes `state` when present, and Better Auth client helpers continue to generate and validate it.

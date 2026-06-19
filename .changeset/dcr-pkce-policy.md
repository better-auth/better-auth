---
"@better-auth/oauth-provider": minor
---

OAuth Provider now lets servers set `clientRegistrationRequirePKCE: false` to allow confidential clients created through Dynamic Client Registration to complete authorization-code flows without PKCE. Public clients and authorization requests with `offline_access` still require PKCE.

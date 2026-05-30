---
"@better-auth/oauth-provider": patch
---

Enforce the `clientPrivileges` create check on dynamic client registration.

`POST /oauth2/register` reached OAuth client persistence without the create gate that `/oauth2/create-client` and `/admin/oauth2/create-client` enforced. A deployment that restricted client creation through `clientPrivileges` could still let any authenticated user register a confidential client and receive a `client_secret`. The create check now runs at the single client-creation chokepoint, so every registration route enforces it by construction.

Unauthenticated public-client registration through `allowUnauthenticatedClientRegistration` is unchanged.

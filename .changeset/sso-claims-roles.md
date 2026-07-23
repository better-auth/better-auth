---
"@better-auth/sso": minor
---

SSO organization provisioning can now map OpenID Connect (OIDC) user info, verified ID token claims, and SAML attributes to organization roles during sign-in. When a mapper is configured, later sign-ins synchronize existing SSO members by default; set `syncRoleOnLogin` to `false` to keep their current roles. `defaultRole` remains limited to new memberships. Automatic synchronization never removes an organization's creator role, and mapper errors stop sign-in before Better Auth writes a session cookie.

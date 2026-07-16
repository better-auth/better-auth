---
"@better-auth/scim": minor
"@better-auth/core": patch
"better-auth": patch
---

SCIM connections can now provision Users, Groups, and direct memberships into application-defined provisioning domains without the organization or SSO plugins. Applications can map Group membership to validated custom roles through projections. The service also supports SCIM 2.0 discovery, filtering, pagination, response attribute selection, atomic PATCH operations, and common request patterns used by Microsoft Entra ID and Okta.

This replaces the previous SCIM configuration, client APIs, database schema, and organization-backed Group model. Existing SCIM installations cannot migrate provisioning state in place. Follow the SCIM cutover in the 1.7 upgrade guide, including full directory reprovisioning, before resuming traffic.

Deferred database side effects now run only after a successful transaction. A rolled-back User update no longer refreshes its cached profile, and a rolled-back bulk session revocation no longer invalidates sessions.

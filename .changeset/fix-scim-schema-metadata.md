---
"@better-auth/scim": patch
---

Correct served `/scim/v2/Schemas` metadata for the User resource: `displayName` is now declared `mutability: "readWrite"` (RFC 7643 §2.2 default), `id` is now declared `returned: "always"` (RFC 7643 §3), and the `externalId` common attribute is now included in the attributes list.

Schema-aware SCIM clients (Okta, Azure AD, Rippling) pre-fetch this schema and omit any attribute declared `readOnly` or absent from PUT/PATCH bodies, so the previous metadata made `displayName` and `externalId` effectively unwritable through those providers.

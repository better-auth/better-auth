---
"better-auth": minor
"@better-auth/core": minor
---

Microsoft sign-in now identifies Entra accounts with the stable `oid` claim in both the built-in `microsoft` provider and the Generic OAuth `microsoftEntraId` helper. Tokens without a valid `oid` are rejected, and the Generic OAuth helper refuses to initialize unless Microsoft discovery provides ID-token verification metadata. Existing Microsoft account rows created from `sub` must be migrated before upgrading.

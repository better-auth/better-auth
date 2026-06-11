---
"better-auth": patch
---

Validate roles when updating an organization member. Roles are now normalized into individual tokens and checked against the configured static and dynamic roles, so unknown or malformed role values are rejected instead of being persisted.

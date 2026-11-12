---
"better-auth": patch
---

Reject role names that contain the list separator when creating or renaming an organization role (`create-role`, `update-role`). Member roles are stored comma-joined and resolved by splitting on `,`, so a role whose name contained a comma could be created but never assigned, silently occupying a role slot. Such names now return a `400` with the `INVALID_ROLE_NAME` error code. See https://github.com/better-auth/better-auth/issues/11303.

---
"@better-auth/oauth-provider": minor
---

`adminUpdateOAuthClient` can now grant or take back RP-initiated logout on any client by sending only `enable_end_session`, including anonymous registrations and Client ID Metadata Document clients, which have no owner. Before, changing it required owning the client, so the only way to revoke logout from those clients was a direct database write. When `clientPrivileges` is set, the call needs it to approve `update`.

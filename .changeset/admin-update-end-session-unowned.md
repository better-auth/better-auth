---
"@better-auth/oauth-provider": minor
---

`adminUpdateOAuthClient` can now grant or take back RP-initiated logout on any client by sending only `enable_end_session`, including anonymous registrations and Client ID Metadata Document clients, which have no owner. Before, changing it required owning the client, so the only way to revoke logout from those clients was a direct database write. Such a call, like a cross-owner `client_credentials_scopes` change, leaves the client's other metadata as stored and no longer re-validates it, so it works on metadata document clients whose redirect URIs only their own registration rules allow. When `clientPrivileges` is set, the call needs it to approve `update`. A call that also changes other fields on a client you do not own still fails with 401, and its `error_description` now names the fields you can change.

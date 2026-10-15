---
"@better-auth/oauth-provider": minor
---

Every app must run its migration: this release adds an optional `pending` column to `oauthClient`.

Apps with `allowUnauthenticatedClientRegistration` can now give self-registered clients an owner, by defining `approvePendingClient`. Until now, such a client could obtain tokens as soon as any user consented, and it belonged to no user or organization, so nobody could see, update, or delete it through the client endpoints. With the option:

- A client registered without a session or initial access token waits for approval and cannot obtain tokens. It must register the `authorization_code` grant.
- When a user accepts consent, your callback decides whether they may approve it and returns its owner (`clientReference`), such as the organization they administer. The owner's members can then manage the client. Returning `false` redirects to the client with `access_denied`, as a denied consent does.
- Registration responses and the public client endpoints include `pending: true`, so your consent page can tell the user.
- Approval grants no machine access. Open registration may request `client_credentials`, but an administrator still assigns its scopes through `adminUpdateOAuthClient`.

Apps that don't define the option see no change. Clients discovered through CIMD are never pending, since one discovered client serves every organization that uses the software.

For all apps using CIMD, a metadata refresh no longer undoes a scope ceiling or a disable that an administrator set while the refresh was running.

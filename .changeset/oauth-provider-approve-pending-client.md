---
"@better-auth/oauth-provider": minor
---

Apps with open dynamic client registration or CIMD discovery can now hold self-registered clients until a person approves them, by defining `approvePendingClient`. Apps that don't define it see no change. Every app needs to run its migration: this release adds an optional `pending` column to `oauthClient`.

- A client registered without a session or initial access token, or discovered through CIMD, is stored as pending. It cannot obtain tokens until a user accepts consent and your callback names its owner (`clientReference`).
- If the callback returns `false`, the user is redirected to the client with `access_denied`, the same as a denied consent.
- A pending client must register the `authorization_code` grant. Open registration may also request `client_credentials`, but approval does not enable it: an administrator still assigns its scopes through `adminUpdateOAuthClient`.
- Registration responses and the public client endpoints include `pending: true`, so your consent page can tell the user.
- For all apps, a CIMD metadata refresh no longer undoes a scope ceiling or a disable that was set while the refresh was running.

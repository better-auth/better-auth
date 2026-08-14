---
"@better-auth/oauth-provider": minor
---

Removed the `silenceWarnings` option from the oauth-provider plugin. The plugin already serves the oauth-authorization-server and openid-configuration metadata endpoints, so the init warnings and the config flag used to silence them are no longer needed. Delete any `silenceWarnings` entries from your oauthProvider config.

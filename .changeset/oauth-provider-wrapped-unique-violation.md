---
"@better-auth/oauth-provider": patch
---

Recognise unique-constraint and missing-table errors that adapters wrap in `error.cause`. The Drizzle adapter reports the failed SQL as the error message and puts the Postgres SQLSTATE on `cause`, so `seedResources` did not detect a lost insert race and rethrew — aborting the plugin's `init` before it returned the back-channel-logout session hooks.

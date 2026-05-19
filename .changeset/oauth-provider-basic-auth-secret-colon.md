---
"@better-auth/oauth-provider": patch
---

Basic Auth authentication now accepts `client_secret` values that contain `:`. Previously `/token`, `/revoke`, and `/introspect` rejected valid credentials for any confidential client whose secret contained a colon.

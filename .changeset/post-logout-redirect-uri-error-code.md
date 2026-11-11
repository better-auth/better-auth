---
"@better-auth/oauth-provider": patch
---

Client registration and client updates now return `invalid_redirect_uri`, not `invalid_client_metadata`, when a `post_logout_redirect_uris` entry uses `http` outside the allowed hosts or contains credentials, matching `redirect_uris`. Clients that match on the old error code need to check for the new one.

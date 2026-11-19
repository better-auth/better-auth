---
"@better-auth/cimd": patch
---

Client ID Metadata Documents whose `client_uri` is on a different origin than the `client_id` are now accepted with the default options. `originBoundFields` now defaults to `["post_logout_redirect_uris"]`; add `"client_uri"` to it only if you deliberately want to keep the old restriction.

---
"@better-auth/oauth-provider": patch
---

A signing key or post-logout redirect URI that a client removes from its Client ID Metadata Document now stops working at the next refresh. Previously, a refresh kept the stored value of any field the document no longer listed, so a removed inline `jwks` key could still authenticate the client and a removed `post_logout_redirect_uris` entry was still accepted. The client's name, URIs, contacts, keys, software identifiers, and `dpop_bound_access_tokens` are now cleared the same way, as are its `response_types` once the document drops the `authorization_code` grant, while a stored `subject_type` is kept.

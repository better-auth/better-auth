---
"@better-auth/oauth-provider": patch
---

The `WWW-Authenticate: Basic` challenge on a failed client authentication now includes the `realm` parameter that [RFC 7617 §2](https://www.rfc-editor.org/rfc/rfc7617#section-2) requires. Paths that sent a bare `Basic` now send `Basic realm="oauth"`. Challenges for other schemes are unchanged.

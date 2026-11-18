---
"@better-auth/oauth-provider": patch
---

The `WWW-Authenticate: Basic` challenge on a failed client authentication now includes the `realm` parameter that [RFC 7617 §2](https://www.rfc-editor.org/rfc/rfc7617#section-2) requires, so the header is `Basic realm="oauth"` instead of a bare `Basic`. Challenges for other schemes are unchanged.

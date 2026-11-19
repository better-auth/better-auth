---
"@better-auth/expo": patch
---

Fix `getSetCookie` throwing `RangeError` on unparseable `Expires` or `Max-Age` attributes; invalid attributes are now ignored and the cookie is retained as a session cookie per RFC 6265.

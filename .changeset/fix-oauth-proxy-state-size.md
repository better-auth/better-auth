---
"better-auth": patch
---

fix(oauth-proxy): produce compact state parameter to comply with OAuth 2.0 provider limits (such as X/Twitter 500-character ceiling) by eliminating redundant double encryption and using compressed base64url state packing while maintaining backward compatibility for legacy state packages.

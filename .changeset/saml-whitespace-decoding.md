---
"@better-auth/sso": patch
---

fix(sso): strip whitespace from SAMLResponse before base64 decoding

Some SAML IDPs send SAMLResponse with line-wrapped base64 (per RFC 2045), which caused decoding failures. Whitespace is now stripped at the request boundary before any processing.

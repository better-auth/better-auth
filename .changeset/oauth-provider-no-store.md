---
"@better-auth/oauth-provider": patch
---

OAuth responses that carry credentials are now sent with `Cache-Control: no-store`, so proxies, CDNs, and browsers no longer cache them. This covers the token endpoint (access, refresh, and ID tokens), dynamic client registration (the client secret), token introspection, and userinfo.

Dynamic client registration now returns `201 Created` on success, as required by RFC 7591, instead of `200`.

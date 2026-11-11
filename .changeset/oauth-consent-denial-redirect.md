---
"@better-auth/oauth-provider": patch
---

Denying consent now redirects to the client only while the client is enabled and its `redirect_uri` is still valid. Before, a denial within the signed request lifetime still redirected to the `redirect_uri` after the client was disabled, the URI was removed from its registration, or `allowInsecureRedirectUri` or `validateRedirectUri` stopped accepting it. The user now sees the server error page instead.

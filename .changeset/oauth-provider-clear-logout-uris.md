---
"@better-auth/oauth-provider": patch
---

OAuth client updates can now remove a logout URI. Sending `backchannel_logout_uri: null` or `frontchannel_logout_uri: null` to `/oauth2/update-client` or `adminUpdateOAuthClient` clears the URI and its `*_session_required` flag, and the client stops receiving those logout notifications. Before, `null` was rejected and a registered logout URI could only be replaced.

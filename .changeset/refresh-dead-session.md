---
"@better-auth/oauth-provider": patch
---

Fixed the `refresh_token` grant issuing access and ID tokens whose `sid` names a session that has expired or been deleted. Introspection reported those tokens inactive as soon as they were issued, so a client that refreshed after the user's session ended got a token it couldn't use. Refreshed tokens now leave out `sid` once the session has ended, the same way refresh token introspection already does.

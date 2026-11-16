---
"@better-auth/oauth-provider": minor
---

A session that was revoked in the session store can no longer approve or deny an interaction request, such as a CIBA request or an OAuth device code, while `session.cookieCache` still serves it. The user is sent to the request's error page and the request stays pending. The provider now confirms the session in the store before it calls an interaction request handler's `approve` or `deny`, so handlers don't need their own check. Requests from active sessions are unchanged.

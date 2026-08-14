---
"@better-auth/oauth-provider": patch
---

The RP-Initiated Logout endpoint continues to accept `GET` and now accepts form-encoded `POST` requests. It also supports the JSON bodies sent by Better Auth's generated client. After explicit confirmation, browser users can log out without an `id_token_hint`. They receive clear confirmation, success, or error pages. Invalid ID token hints fail safely, and logout redirects require an exact registered `post_logout_redirect_uri`.

---
"better-auth": patch
---

Add a `getTempEmail` option to the username plugin so users can sign up with a username and no email. When a sign-up request has a username but no email, the plugin generates one from the normalized username and creates the user with `emailVerified: false`. Requests that include an email are unchanged.

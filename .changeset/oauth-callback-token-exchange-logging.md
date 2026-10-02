---
"better-auth": patch
---

Log OAuth token-exchange failures in the `/callback/:id` handler: the authorization-code exchange error now includes the provider id, and a 200 response with neither `access_token` nor `id_token` (e.g. Slack's `{ok:false,error:"invalid_code"}`) is now logged instead of failing silently until the later user-info step.

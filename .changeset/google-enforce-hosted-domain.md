---
"@better-auth/core": patch
---

Enforce the Google `hd` (hosted domain) option against the id token. Previously `hd` was only sent to Google as an authorization hint, which does not by itself restrict sign-in to the configured Workspace domain. When `hd` is set, the `hd` claim on the verified id token (`verifyIdToken`) and the decoded callback profile (`getUserInfo`) must be present and match, otherwise sign-in is rejected.

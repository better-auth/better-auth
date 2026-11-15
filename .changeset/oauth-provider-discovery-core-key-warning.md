---
"@better-auth/oauth-provider": minor
---

Discovery now logs a warning when it ignores a metadata contribution: an OAuth provider extension or client discovery that sets a key the provider owns, such as `issuer`, or an extension that sets a key a client discovery already sets. Previously these contributions were dropped silently. The published values are unchanged, except that metadata keys named after `Object.prototype` members, such as `toString` or `__proto__`, were dropped before and are now published.
